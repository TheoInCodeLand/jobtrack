const express = require('express');
const router = express.Router();
const db = require('../database/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Configure multer for profile picture uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './public/uploads/profiles/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + req.session.userId + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and WebP images are allowed'));
    }
  }
});

// GET: View Profile Dashboard (/user/profile)
router.get('/profile', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, full_name, email, institution, graduation_year, career_goal,
                    phone, location, timezone, bio, linkedin_url, github_url, portfolio_url,
                    skills, languages, desired_salary_min, desired_salary_max,
                    preferred_work_arrangement, preferred_locations, willing_to_relocate,
                    years_of_experience, current_employer, current_job_title, open_to_work,
                    email_notifications, weekly_digest,
                    profile_picture, updated_at, created_at
             FROM users WHERE id = $1`,
            [req.session.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).render('error', { message: "User not found" });
        }

        const profile = result.rows[0];
        
        // Parse JSONB fields
        profile.skills = profile.skills || [];
        profile.languages = profile.languages || [];
        profile.preferred_locations = profile.preferred_locations || [];

        // Get application stats
        const statsResult = await db.query(`
            SELECT 
                COUNT(*) as total_apps,
                COUNT(*) FILTER (WHERE status = 'offer received') as offers,
                COUNT(*) FILTER (WHERE status = 'interview' OR status = 'final interview') as interviews,
                AVG(response_time_days) FILTER (WHERE response_time_days IS NOT NULL) as avg_response
            FROM applications 
            WHERE user_id = $1
        `, [req.session.userId]);

        const stats = statsResult.rows[0];

        // Calculate profile completion percentage
        const completionFields = [
            profile.phone, profile.location, profile.bio, profile.linkedin_url,
            profile.skills.length > 0, profile.years_of_experience > 0,
            profile.current_job_title, profile.desired_salary_min,
            profile.preferred_work_arrangement, profile.profile_picture
        ];
        const completedFields = completionFields.filter(Boolean).length;
        const profileCompletion = Math.round((completedFields / completionFields.length) * 100);

        res.render('profile/dashboard', {
            user: req.session.userName,  // For navbar/sidebar
            profile,                      // Full profile data
            stats,
            profileCompletion,
            success: req.query.success || null,
            error: req.query.error || null
        });

    } catch (err) {
        console.error('Profile error:', err);
        res.status(500).send(`
            <h1>Error</h1>
            <p>${err.message}</p>
            <a href="/user/profile">Back to Profile</a>
        `);
    }
});

// GET: Edit Profile Form (/user/profile/edit)
router.get('/profile/edit', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM users WHERE id = $1`,
            [req.session.userId]
        );

        const profile = result.rows[0];
        profile.skills = profile.skills || [];
        profile.languages = profile.languages || [];
        profile.preferred_locations = profile.preferred_locations || [];

        res.render('profile/edit', {
            user: req.session.userName,  // For navbar/sidebar
            profile,                      // Full profile data
            error: req.query.error || null
        });

    } catch (err) {
        console.error('Edit profile error:', err);
        res.status(500).send(`
            <h1>Error</h1>
            <p>${err.message}</p>
            <a href="/user/profile">Back to Profile</a>
        `);
    }
});

// POST: Update Profile (/user/profile/update)
router.post('/profile/update', async (req, res) => {
    try {
        const {
            full_name, phone, location, timezone, bio,
            linkedin_url, github_url, portfolio_url,
            skills, languages, desired_salary_min, desired_salary_max,
            preferred_work_arrangement, preferred_locations, willing_to_relocate,
            years_of_experience, current_employer, current_job_title, open_to_work
        } = req.body;

        // Parse arrays from comma-separated strings or JSON
        const skillsArray = typeof skills === 'string' ? 
            skills.split(',').map(s => s.trim()).filter(Boolean) : 
            (Array.isArray(skills) ? skills : []);
            
        const languagesArray = typeof languages === 'string' ? 
            languages.split(',').map(l => l.trim()).filter(Boolean) : 
            (Array.isArray(languages) ? languages : []);
            
        const locationsArray = typeof preferred_locations === 'string' ? 
            preferred_locations.split(',').map(l => l.trim()).filter(Boolean) : 
            (Array.isArray(preferred_locations) ? preferred_locations : []);

        const query = `
            UPDATE users SET
                full_name = $1,
                phone = $2,
                location = $3,
                timezone = $4,
                bio = $5,
                linkedin_url = $6,
                github_url = $7,
                portfolio_url = $8,
                skills = $9,
                languages = $10,
                desired_salary_min = $11,
                desired_salary_max = $12,
                preferred_work_arrangement = $13,
                preferred_locations = $14,
                willing_to_relocate = $15,
                years_of_experience = $16,
                current_employer = $17,
                current_job_title = $18,
                open_to_work = $19,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $20
            RETURNING id
        `;

        const values = [
            full_name, phone, location, timezone, bio,
            linkedin_url, github_url, portfolio_url,
            JSON.stringify(skillsArray), JSON.stringify(languagesArray),
            desired_salary_min ? parseInt(desired_salary_min) : null,
            desired_salary_max ? parseInt(desired_salary_max) : null,
            preferred_work_arrangement,
            JSON.stringify(locationsArray),
            willing_to_relocate === 'on' || willing_to_relocate === 'true',
            years_of_experience ? parseInt(years_of_experience) : 0,
            current_employer, current_job_title,
            open_to_work === 'on' || open_to_work === 'true',
            req.session.userId
        ];

        await db.query(query, values);
        
        // Update session name if changed
        if (full_name !== req.session.userName) {
            req.session.userName = full_name;
        }

        res.redirect('/user/profile?success=Profile updated successfully');

    } catch (err) {
        console.error('Update profile error:', err);
        res.redirect(`/user/profile/edit?error=${encodeURIComponent(err.message)}`);
    }
});

// POST: Upload Profile Picture (/user/profile/upload-photo)
router.post('/profile/upload-photo', upload.single('profile_picture'), async (req, res) => {
    try {
        if (!req.file) {
            return res.redirect('/user/profile/edit?error=No file uploaded');
        }

        const imagePath = `/uploads/profiles/${req.file.filename}`;
        
        // Get old picture to delete
        const oldPicResult = await db.query(
            'SELECT profile_picture FROM users WHERE id = $1',
            [req.session.userId]
        );
        
        const oldPicture = oldPicResult.rows[0]?.profile_picture;
        
        // Update database
        await db.query(
            'UPDATE users SET profile_picture = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [imagePath, req.session.userId]
        );

        // Delete old picture file
        if (oldPicture && oldPicture !== imagePath) {
            const oldPath = path.join(__dirname, '..', 'public', oldPicture);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        res.redirect('/user/profile?success=Profile picture updated');

    } catch (err) {
        console.error('Upload error:', err);
        res.redirect(`/user/profile/edit?error=${encodeURIComponent(err.message)}`);
    }
});

// GET: Settings Page (/user/settings)
router.get('/settings', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT 
                u.email_notifications,
                u.weekly_digest
            FROM users u
            LEFT JOIN applications a ON a.user_id = u.id
            WHERE u.id = $1;`,
            [req.session.userId]
        );

        const settings = result.rows[0];
        res.render('settings', { 
            user: req.session.userName,
            settings, 
            error: req.query.error || null, 
            success: req.query.success || null 
        });

    } catch (err) {
        console.error('Settings error:', err);
        res.status(500).send(`
            <h1>Error</h1>
            <p>${err.message}</p>
            <a href="/user/profile">Back to Profile</a>
        `);
    }
});

// POST: Update Settings (/user/settings)
router.post('/settings', async (req, res) => {
    try {
        const {
            email_notifications,
            weekly_digest
        } = req.body;

        await db.query(`
            UPDATE users SET
                email_notifications = $2,
                weekly_digest = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
        `, [
            email_notifications === 'on' || email_notifications === 'true',
            weekly_digest === 'on' || weekly_digest === 'true',
            req.session.userId
        ]);

        res.redirect('/user/settings?success=Settings saved successfully');

    } catch (err) {
        console.error('Update settings error:', err);
        res.redirect(`/user/settings?error=${encodeURIComponent(err.message)}`);
    }
});

// POST: Change Password (/user/settings/password)
router.post('/settings/password', async (req, res) => {
    try {
        const { current_password, new_password, confirm_password } = req.body;

        if (new_password !== confirm_password) {
            return res.redirect('/user/settings?error=New passwords do not match');
        }

        if (new_password.length < 8) {
            return res.redirect('/user/settings?error=Password must be at least 8 characters');
        }

        // Verify current password
        const userResult = await db.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.session.userId]
        );

        if (userResult.rows.length === 0) {
            return res.redirect('/user/settings?error=User not found');
        }

        const validPassword = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
        
        if (!validPassword) {
            return res.redirect('/user/settings?error=Current password is incorrect');
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(new_password, 10);
        
        await db.query(
            'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [hashedPassword, req.session.userId]
        );

        res.redirect('/user/settings?success=Password changed successfully');

    } catch (err) {
        console.error('Change password error:', err);
        res.redirect(`/user/settings?error=${encodeURIComponent(err.message)}`);
    }
});

// GET: Public Profile (for sharing) - /user/public/:id
router.get('/public/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        
        const result = await db.query(
            `SELECT full_name, bio, skills, years_of_experience, current_job_title,
                    location, preferred_work_arrangement, profile_picture, open_to_work,
                    linkedin_url, github_url, portfolio_url
             FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).render('error', { message: "Profile not found" });
        }

        const profile = result.rows[0];

        res.render('profile/public', { 
            user: req.session.userName || null,
            profile 
        });

    } catch (err) {
        console.error('Public profile error:', err);
        res.status(500).send(`
            <h1>Error</h1>
            <p>${err.message}</p>
            <a href="/user/profile">Back to Profile</a>
        `);
    }
});

module.exports = router;