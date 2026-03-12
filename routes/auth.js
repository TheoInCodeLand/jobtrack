const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');

// GET: Register Page
router.get('/register', (req, res) => {
    res.render('register', { error: null });
});

// POST: Register Logic
router.post('/register', async (req, res) => {
    try {
        const { full_name, email, password, institution, graduation_year, career_goal } = req.body;
        
        // Ensure email is lowercase for case-insensitive login
        const normalizedEmail = email.toLowerCase().trim();

        // Check if the user already exists to prevent database errors
        const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
        if (existingUser.rows.length > 0) {
            return res.render('register', { error: 'An account with that email already exists.' });
        }

        // Hash the password with a salt round of 10
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the new user and use RETURNING to grab the new ID immediately
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

        // Automatically log the user in after registration
        req.session.userId = newUser.id;
        req.session.userName = newUser.full_name;
        
        // Redirect to the dashboard immediately
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

// GET: Logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Logout error:', err);
        res.clearCookie('connect.sid');
        res.redirect('/auth/login');
    });
});

module.exports = router;