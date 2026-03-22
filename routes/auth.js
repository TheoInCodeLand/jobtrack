const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

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

        // 1. Check if user exists by Google ID
        let userResult = await db.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
        
        if (userResult.rows.length > 0) {
            return done(null, userResult.rows[0]);
        }

        // 2. Check if user exists by email (link Google to existing account)
        userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (userResult.rows.length > 0) {
            // Link Google ID to existing account
            await db.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, userResult.rows[0].id]);
            return done(null, userResult.rows[0]);
        }

        // 3. Create new user (without required profile fields - will redirect to complete profile)
        const insertQuery = `
            INSERT INTO users (full_name, email, google_id, institution, graduation_year, career_goal, password_hash) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        
        const newUser = await db.query(insertQuery, [
            fullName,
            email,
            googleId,
            null, // institution - to be filled later
            null, // graduation_year
            null, // career_goal
            null  // no password for Google users
        ]);

        return done(null, newUser.rows[0]);
        
    } catch (err) {
        return done(err, null);
    }
}));

// Regular Routes (keep existing ones)
router.get('/register', (req, res) => {
    res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
    try {
        const { full_name, email, password, institution, graduation_year, career_goal } = req.body;
        const normalizedEmail = email.toLowerCase().trim();

        const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
        if (existingUser.rows.length > 0) {
            return res.render('register', { error: 'An account with that email already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insertQuery = `
            INSERT INTO users (full_name, email, password_hash, institution, graduation_year, career_goal) 
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, full_name
        `;
        const newUserData = await db.query(insertQuery, [
            full_name, 
            normalizedEmail, 
            hashedPassword, 
            institution, 
            graduation_year, 
            career_goal
        ]);

        const newUser = newUserData.rows[0];
        req.session.userId = newUser.id;
        req.session.userName = newUser.full_name;
        
        res.redirect('/applications/dashboard');

    } catch (err) {
        console.error('Registration Error:', err);
        res.render('register', { error: 'Something went wrong during registration. Please try again.' });
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
            
            // Check if user has a password (Google users might not have one)
            if (!user.password_hash) {
                return res.render('login', { 
                    error: 'This account uses Google Sign-In. Please use the Google button below.' 
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
            // Set session exactly like regular login
            req.session.userId = req.user.id;
            req.session.userName = req.user.full_name;

            // Check if profile is incomplete (Google users won't have institution/career_goal yet)
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

// Complete Profile Routes (for Google users missing required fields)
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