const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple');
const { v4: uuidv4 } = require('uuid');
const { sendVerificationEmail, sendWelcomeEmail } = require('../services/emailService');

// Passport serialization
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
        done(null, result.rows[0]);
    } catch (err) {
        done(err, null);
    }
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
},
async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value.toLowerCase();
        const googleId = profile.id;
        const fullName = profile.displayName;

        let userResult = await db.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
        
        if (userResult.rows.length > 0) {
            return done(null, userResult.rows[0]);
        }

        userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (userResult.rows.length > 0) {
            await db.query('UPDATE users SET google_id = $1, email_verified = true WHERE id = $2', [googleId, userResult.rows[0].id]);
            return done(null, userResult.rows[0]);
        }

        // Google users are auto-verified since email is verified by Google
        const insertQuery = `
            INSERT INTO users (full_name, email, google_id, institution, graduation_year, career_goal, password_hash, email_verified) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        
        const newUser = await db.query(insertQuery, [
            fullName,
            email,
            googleId,
            null,
            null,
            null,
            null,
            true // Auto-verify Google users
        ]);

        return done(null, newUser.rows[0]);
        
    } catch (err) {
        return done(err, null);
    }
}));

// Apple Sign-In Strategy
passport.use(new AppleStrategy({
    clientID: process.env.APPLE_CLIENT_ID,
    teamID: process.env.APPLE_TEAM_ID,
    keyID: process.env.APPLE_KEY_ID,
    privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH,
    callbackURL: "/auth/apple/callback",
    passReqToCallback: true
},
async (req, accessToken, refreshToken, idToken, profile, done) => {
    try {
        const email = profile.email?.toLowerCase();
        const appleId = profile.id;
        const fullName = profile.name ? `${profile.name.firstName || ''} ${profile.name.lastName || ''}`.trim() : null;

        if (!email) {
            return done(new Error('Email is required from Apple Sign In'));
        }

        let userResult = await db.query('SELECT * FROM users WHERE apple_id = $1', [appleId]);
        
        if (userResult.rows.length > 0) {
            return done(null, userResult.rows[0]);
        }

        userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (userResult.rows.length > 0) {
            await db.query('UPDATE users SET apple_id = $1, email_verified = true WHERE id = $2', [appleId, userResult.rows[0].id]);
            return done(null, userResult.rows[0]);
        }

        // Apple users are auto-verified since email is verified by Apple
        const insertQuery = `
            INSERT INTO users (full_name, email, apple_id, institution, graduation_year, career_goal, password_hash, email_verified) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        
        const newUser = await db.query(insertQuery, [
            fullName || 'Apple User',
            email,
            appleId,
            null,
            null,
            null,
            null,
            true // Auto-verify Apple users
        ]);

        return done(null, newUser.rows[0]);
        
    } catch (err) {
        return done(err, null);
    }
}));

// Regular Routes
router.get('/register', (req, res) => {
    res.render('register', { error: null, message: null });
});

router.post('/register', async (req, res) => {
    try {
        const { full_name, email, password, institution, graduation_year, career_goal } = req.body;
        const normalizedEmail = email.toLowerCase().trim();

        // Check if email already exists
        const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
        
        if (existingUser.rows.length > 0) {
            const user = existingUser.rows[0];
            
            // If email exists but not verified, allow re-registration
            if (!user.email_verified && !user.google_id && !user.apple_id) {
                // Delete unverified account to allow fresh registration
                await db.query('DELETE FROM users WHERE id = $1', [user.id]);
            } else {
                return res.render('register', { 
                    error: 'An account with that email already exists. Please log in instead.',
                    message: null 
                });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = uuidv4();
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const insertQuery = `
            INSERT INTO users (
                full_name, email, password_hash, institution, graduation_year, 
                career_goal, verification_token, verification_token_expires, email_verified
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, full_name, email
        `;
        
        const newUserData = await db.query(insertQuery, [
            full_name, 
            normalizedEmail, 
            hashedPassword, 
            institution, 
            graduation_year, 
            career_goal,
            verificationToken,
            tokenExpires,
            false // Not verified yet
        ]);

        const newUser = newUserData.rows[0];

        // Send verification email
        await sendVerificationEmail(normalizedEmail, verificationToken, full_name);

        // Redirect to verification pending page instead of dashboard
        res.render('verification-pending', { 
            email: normalizedEmail,
            error: null 
        });

    } catch (err) {
        console.error('Registration Error:', err);
        res.render('register', { 
            error: 'Something went wrong during registration. Please try again.',
            message: null 
        });
    }
});

// Email Verification Route
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.render('verification-result', { 
                success: false, 
                message: 'Invalid verification link.' 
            });
        }

        // Find user with this token
        const result = await db.query(
            'SELECT * FROM users WHERE verification_token = $1 AND verification_token_expires > NOW()',
            [token]
        );

        if (result.rows.length === 0) {
            return res.render('verification-result', { 
                success: false, 
                message: 'This verification link has expired or is invalid. Please request a new one.' 
            });
        }

        const user = result.rows[0];

        // Mark email as verified and clear token
        await db.query(
            'UPDATE users SET email_verified = true, verification_token = null, verification_token_expires = null WHERE id = $1',
            [user.id]
        );

        // Send welcome email
        await sendWelcomeEmail(user.email, user.full_name);

        res.render('verification-result', { 
            success: true, 
            message: 'Your email has been verified! You can now log in to your account.' 
        });

    } catch (err) {
        console.error('Verification Error:', err);
        res.render('verification-result', { 
            success: false, 
            message: 'An error occurred during verification. Please try again.' 
        });
    }
});

// Resend Verification Email
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = email.toLowerCase().trim();

        const result = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);

        if (result.rows.length === 0) {
            return res.render('verification-pending', { 
                email: normalizedEmail,
                error: 'No account found with this email address.' 
            });
        }

        const user = result.rows[0];

        if (user.email_verified) {
            return res.render('verification-pending', { 
                email: normalizedEmail,
                error: 'This email is already verified. Please log in.' 
            });
        }

        // Generate new token
        const verificationToken = uuidv4();
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await db.query(
            'UPDATE users SET verification_token = $1, verification_token_expires = $2 WHERE id = $3',
            [verificationToken, tokenExpires, user.id]
        );

        await sendVerificationEmail(normalizedEmail, verificationToken, user.full_name);

        res.render('verification-pending', { 
            email: normalizedEmail,
            error: null,
            message: 'Verification email resent! Please check your inbox.' 
        });

    } catch (err) {
        console.error('Resend Verification Error:', err);
        res.render('verification-pending', { 
            email: req.body.email,
            error: 'Failed to resend verification email. Please try again.' 
        });
    }
});

router.get('/login', (req, res) => {
    res.render('login', { error: null });
}); 

router.post('/login', async (req, res) => {
    try {
        const { email, password, remember } = req.body;
        const normalizedEmail = email.toLowerCase().trim();
        const userResult = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);

        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            
            // Check if email is verified
            if (!user.email_verified) {
                return res.render('verification-pending', { 
                    email: normalizedEmail,
                    error: 'Please verify your email before logging in.' 
                });
            }
            
            if (!user.password_hash) {
                let authMethod = 'Google or Apple';
                if (user.google_id) authMethod = 'Google';
                else if (user.apple_id) authMethod = 'Apple';
                
                return res.render('login', { 
                    error: `This account uses ${authMethod} Sign-In. Please use the appropriate button below.` 
                });
            }
            
            const match = await bcrypt.compare(password, user.password_hash);
            
            if (match) {
                req.session.userId = user.id;
                req.session.userName = user.full_name;

                if (remember === 'on') {
                    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
                } else {
                    req.session.cookie.expires = false; 
                }

                return res.redirect('/applications/dashboard');
            }
        }
        
        res.render('login', { error: 'Invalid email or password.' });

    } catch (err) {
        console.error('Login Error:', err);
        res.render('login', { error: 'A server error occurred. Please try again later.' });
    }
});

// Google OAuth Routes
router.get('/google', passport.authenticate('google', { 
    scope: ['profile', 'email'] 
}));

router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/auth/login' }),
    async (req, res) => {
        try {
            req.session.userId = req.user.id;
            req.session.userName = req.user.full_name;

            if (!req.user.institution || !req.user.graduation_year || !req.user.career_goal) {
                return res.redirect('/auth/complete-profile');
            }

            res.redirect('/applications/dashboard');
        } catch (err) {
            console.error('Google Callback Error:', err);
            res.redirect('/auth/login');
        }
    }
);

// Apple Sign-In Routes
// router.get('/apple', passport.authenticate('apple'));

// router.post('/apple/callback', 
//     passport.authenticate('apple', { failureRedirect: '/auth/login' }),
//     async (req, res) => {
//         try {
//             req.session.userId = req.user.id;
//             req.session.userName = req.user.full_name;

//             if (!req.user.institution || !req.user.graduation_year || !req.user.career_goal) {
//                 return res.redirect('/auth/complete-profile');
//             }

//             res.redirect('/applications/dashboard');
//         } catch (err) {
//             console.error('Apple Callback Error:', err);
//             res.redirect('/auth/login');
//         }
//     }
// );

// Complete Profile Routes
router.get('/complete-profile', (req, res) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    res.render('complete-profile', { error: null });
});

router.post('/complete-profile', async (req, res) => {
    try {
        const { institution, graduation_year, career_goal } = req.body;
        const userId = req.session.userId;
        
        await db.query(
            'UPDATE users SET institution = $1, graduation_year = $2, career_goal = $3 WHERE id = $4',
            [institution, graduation_year, career_goal, userId]
        );
        
        res.redirect('/applications/dashboard');
    } catch (err) {
        console.error('Complete Profile Error:', err);
        res.render('complete-profile', { error: 'Failed to update profile. Please try again.' });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Logout error:', err);
        res.clearCookie('connect.sid');
        res.redirect('/auth/login');
    });
});

module.exports = router;