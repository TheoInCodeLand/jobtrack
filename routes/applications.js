const express = require('express');
const router = express.Router();
const db = require('../database/db'); 
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { analyzeCvSkills } = require('../utils/atsScanner');
const { sendApplicationConfirmation } = require('../services/emailService');

// Configure multer for resume uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './public/uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, 'resume-' + Date.now() + path.extname(file.originalname));
  }
});
 
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, and DOCX files are allowed'));
    }
  }
});

// GET: Display form to add new application
router.get('/add', (req, res) => {
    res.render('add-application', { error: null });
});

// POST: Save application with enhanced data capture + CV skills extraction
router.post('/add', upload.single('resume'), async (req, res) => {
    try {
        const {
            company_name, job_title, experience_level, job_domain,
            job_level, app_method, app_method_other, date_applied, closing_date,
            company_size, education_required, location, salary, referral, 
            notes, job_description, required_skills, work_arrangement, 
            industry, time_spent_minutes, tailored_resume, assessment_upfront,
            company_website, job_posting_url, hiring_manager_name, 
            hiring_manager_email, hiring_manager_linkedin, recruiter_name,
            recruiter_company, follow_up_date, your_experience_years,
            assessment_type,
            // NEW FIELDS
            referrer_name, referrer_relationship, company_rating,
            resume_version_used, cover_letter_used, salary_transparent,
            networking_effort,
            // EMAIL FIELDS
            auto_follow_up_enabled
        } = req.body;

        const finalMethod = app_method === 'Other' ? app_method_other : app_method;
        const resume_path = req.file ? `/uploads/${req.file.filename}` : null;
        
        // Parse arrays
        const domainArray = job_domain ? job_domain.split(',').map(item => item.trim()).filter(Boolean) : [];
        const skillsArray = required_skills ? required_skills.split(',').map(item => item.trim()).filter(Boolean) : [];
        
        // Parse booleans
        const isTailored = tailored_resume === 'true' || tailored_resume === 'on';
        const isAssessment = assessment_upfront === 'true' || assessment_upfront === 'on';
        const isReferral = referral === 'yes' || referral === 'true' || referral === 'on';
        const isSalaryTransparent = salary_transparent === 'true' || salary_transparent === 'on';
        const hasCoverLetter = cover_letter_used === 'true' || cover_letter_used === 'on';
        const autoFollowUp = auto_follow_up_enabled === 'true' || auto_follow_up_enabled === 'on';
        
        // Calculate initial response time if last_contact_date provided
        let responseTimeDays = null;
        if (req.body.last_contact_date && date_applied) {
            const applied = new Date(date_applied);
            const contacted = new Date(req.body.last_contact_date);
            responseTimeDays = Math.floor((contacted - applied) / (1000 * 60 * 60 * 24));
        }

        // ========== AUTOMATIC CV SKILLS EXTRACTION ==========
        let skillsYouHave = [];
        let skillsYouLack = [];
        let cvExtractedSkills = [];
        let skillsMatchPercentage = 0;
        
        if (req.file && skillsArray.length > 0) {
            try {
                const cvFullPath = path.join(__dirname, '..', 'public', resume_path);
                console.log('Extracting skills from CV:', cvFullPath);
                
                const analysis = await analyzeCvSkills(cvFullPath, skillsArray);
                
                skillsYouHave = analysis.skillsYouHave;
                skillsYouLack = analysis.skillsYouLack;
                cvExtractedSkills = analysis.cvSkills;
                skillsMatchPercentage = analysis.matchPercentage;
                
                console.log('CV Analysis Results:', {
                    totalRequired: skillsArray.length,
                    matched: skillsYouHave.length,
                    missing: skillsYouLack.length,
                    matchPercentage: analysis.matchPercentage,
                    extracted: cvExtractedSkills.length
                });
                
            } catch (cvError) {
                console.error('CV skills extraction failed:', cvError.message);
                // Continue without CV analysis - don't block application creation
            }
        }
        // =====================================================

        const queryText = `
            INSERT INTO applications (
                company_name, job_title, experience_level, job_level, 
                app_method, date_applied, closing_date, company_size, 
                education_required, location, salary, referral, 
                notes, resume_path, job_description, user_id,
                job_domain, required_skills, work_arrangement, industry, 
                time_spent_minutes, tailored_resume, assessment_upfront,
                company_website, job_posting_url, hiring_manager_name,
                hiring_manager_email, hiring_manager_linkedin, recruiter_name,
                recruiter_company, follow_up_date, your_experience_years,
                assessment_type, status,
                referrer_name, referrer_relationship, company_rating,
                resume_version_used, cover_letter_used, salary_transparent,
                networking_effort, response_time_days, skills_you_have, 
                skills_you_lack, cv_extracted_skills, skills_match_percentage,
                auto_follow_up_enabled, last_reminder_sent,
                created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 
                $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
                $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
                $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, CURRENT_TIMESTAMP
            ) RETURNING id
        `;

        const values = [
            company_name, job_title, experience_level || 0, job_level, 
            finalMethod, date_applied || new Date(), closing_date || null, company_size, 
            education_required, location, salary, isReferral, 
            notes, resume_path, job_description, req.session.userId,
            domainArray, skillsArray, work_arrangement, industry, 
            time_spent_minutes || 0, isTailored, isAssessment,
            company_website || null, job_posting_url || null, hiring_manager_name || null,
            hiring_manager_email || null, hiring_manager_linkedin || null, recruiter_name || null,
            recruiter_company || null, follow_up_date || null, your_experience_years || 0,
            assessment_type || null, 'applied',
            referrer_name || null, referrer_relationship || null, company_rating || null,
            resume_version_used || 'standard', hasCoverLetter, isSalaryTransparent,
            networking_effort || null, responseTimeDays,
            skillsYouHave,      // $42 - skills found in CV that match requirements
            skillsYouLack,      // $43 - skills required but not found in CV
            cvExtractedSkills,  // $44 - all skills extracted from CV
            skillsMatchPercentage, // $45 - calculated match percentage
            autoFollowUp,       // $46 - auto follow-up enabled
            null                // $47 - last_reminder_sent (null initially)
        ];

        const result = await db.query(queryText, values);
        const newApplicationId = result.rows[0].id;

        // ========== SEND CONFIRMATION EMAIL ==========
        try {
            // Get user email
            const userResult = await db.query(
                'SELECT email, full_name FROM users WHERE id = $1',
                [req.session.userId]
            );
            
            const userEmail = userResult.rows[0]?.email;
            
            if (userEmail) {
                const { sendApplicationConfirmation } = require('../services/emailService');
                
                const appDataForEmail = {
                    id: newApplicationId,
                    company_name,
                    job_title,
                    job_level,
                    location,
                    salary,
                    app_method: finalMethod,
                    date_applied: date_applied || new Date(),
                    follow_up_date: follow_up_date || null,
                    company_rating: company_rating || 5,
                    tailored_resume: isTailored,
                    referral: isReferral,
                    skills_match_percentage: skillsMatchPercentage || 0,
                    auto_follow_up_enabled: autoFollowUp
                };

                // Send email asynchronously (don't block response)
                sendApplicationConfirmation(userEmail, appDataForEmail)
                    .then(emailResult => {
                        if (emailResult.success) {
                            console.log(`✅ Confirmation email sent to ${userEmail} for application ${newApplicationId}`);
                        } else {
                            console.error('❌ Failed to send confirmation email:', emailResult.error);
                        }
                    })
                    .catch(err => {
                        console.error('❌ Error sending confirmation email:', err.message);
                    });
            } else {
                console.log('⚠️ No email found for user, skipping confirmation email');
            }
        } catch (emailErr) {
            // Log error but don't block the application creation
            console.error('❌ Error preparing confirmation email:', emailErr.message);
        }
        // ==============================================

        // Redirect to view page
        res.redirect(`/applications/view/${newApplicationId}`);
        
    } catch (err) {
        console.error('Error saving application:', err);
        res.status(500).render('error', { 
            message: "Error saving application: " + (err.message || "Unknown error") 
        });
    }
});


// GET: Dashboard with enhanced filtering and stats
router.get('/dashboard', async (req, res) => {
    try {
        const { status, sort = 'date_applied', order = 'DESC', timeRange = 'all' } = req.query;
        
        let query = 'SELECT * FROM applications WHERE user_id = $1';
        const params = [req.session.userId];
        let paramIndex = 2;
        
        // Status filter
        if (status && status !== 'all') {
            query += ` AND status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        
        // Time range filter
        if (timeRange === '30days') {
            query += ` AND date_applied >= CURRENT_DATE - INTERVAL '30 days'`;
        } else if (timeRange === '90days') {
            query += ` AND date_applied >= CURRENT_DATE - INTERVAL '90 days'`;
        } else if (timeRange === '6months') {
            query += ` AND date_applied >= CURRENT_DATE - INTERVAL '6 months'`;
        }
        
        // Safe sorting
        const allowedSorts = ['date_applied', 'company_name', 'status', 'closing_date', 'follow_up_date', 'company_rating'];
        const sortBy = allowedSorts.includes(sort) ? sort : 'date_applied';
        const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
        
        query += ` ORDER BY ${sortBy} ${sortOrder}`;
        
        const result = await db.query(query, params);
        
        // Enhanced stats query
        const statsQuery = await db.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'applied') as applied,
                COUNT(*) FILTER (WHERE status IN ('shortlisted', 'interview', 'final interview', 'phone screen', 'assessment/test stage')) as in_progress,
                COUNT(*) FILTER (WHERE status = 'offer received') as offers,
                COUNT(*) FILTER (WHERE status = 'offer received' AND offer_accepted = true) as offers_accepted,
                COUNT(*) FILTER (WHERE status IN ('rejected', 'ghosted')) as closed,
                COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
                COUNT(*) FILTER (WHERE status = 'ghosted') as ghosted,
                COUNT(*) FILTER (WHERE follow_up_date <= CURRENT_DATE AND status NOT IN ('offer received', 'rejected', 'ghosted', 'withdrawn')) as needs_followup,
                COUNT(*) FILTER (WHERE company_rating >= 8) as high_priority_apps,
                AVG(response_time_days) FILTER (WHERE response_time_days IS NOT NULL) as avg_response_time,
                AVG(time_spent_minutes) as avg_time_spent,
                SUM(CASE WHEN tailored_resume = true THEN 1 ELSE 0 END) as tailored_count,
                SUM(CASE WHEN referral = true THEN 1 ELSE 0 END) as referral_count
            FROM applications 
            WHERE user_id = $1
        `, [req.session.userId]);
        
        // Get recent activity for sidebar
        const recentActivity = await db.query(`
            SELECT a.company_name, a.job_title, a.status, a.date_applied, a.job_description, a.industry, a.experience_level,
                   cl.communication_type, cl.created_at as last_activity
            FROM applications a
            LEFT JOIN communication_logs cl ON a.id = cl.application_id
            WHERE a.user_id = $1
            ORDER BY COALESCE(cl.created_at, a.date_applied) DESC
            LIMIT 5
        `, [req.session.userId]);
        
        res.render('dashboard', { 
            apps: result.rows, 
            stats: statsQuery.rows[0],
            recentActivity: recentActivity.rows,
            currentFilter: status || 'all',
            currentTimeRange: timeRange,
            user: req.session.userName 
        });
        
    } catch (err) {
        console.error('Error fetching applications:', err);
        res.status(500).render('error', { message: "Error fetching data: " + err.message });
    }
});

// POST: Enhanced status update with outcome tracking
router.post('/update-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejection_stage, rejection_reason, feedback_received, offer_amount, offer_accepted } = req.body;
        
        // Build dynamic update query based on what fields are provided
        let updates = ['status = $1'];
        let values = [status, id, req.session.userId];
        let paramIndex = 4;
        
        // Always update last_contact_date for positive movements
        if (['interview', 'final interview', 'offer received', 'shortlisted', 'phone screen'].includes(status)) {
            updates.push(`last_contact_date = CURRENT_DATE`);
            
            // Calculate response time if not already set
            updates.push(`response_time_days = COALESCE(response_time_days, EXTRACT(DAY FROM (CURRENT_DATE - date_applied)))`);
        }
        
        // Track rejection details
        if (status === 'rejected') {
            if (rejection_stage) {
                updates.push(`rejection_stage = $${paramIndex}`);
                values.push(rejection_stage);
                paramIndex++;
            }
            if (rejection_reason) {
                updates.push(`rejection_reason = $${paramIndex}`);
                values.push(rejection_reason);
                paramIndex++;
            }
        }
        
        // Track offer details
        if (status === 'offer received') {
            if (offer_amount) {
                updates.push(`offer_amount = $${paramIndex}`);
                values.push(offer_amount);
                paramIndex++;
            }
            if (offer_accepted !== undefined) {
                updates.push(`offer_accepted = $${paramIndex}`);
                values.push(offer_accepted === 'true' || offer_accepted === 'on');
                paramIndex++;
            }
            // Calculate time to offer
            updates.push(`time_to_offer_days = EXTRACT(DAY FROM (CURRENT_DATE - date_applied))`);
        }
        
        // Track feedback
        if (feedback_received) {
            updates.push(`feedback_received = $${paramIndex}`);
            values.push(feedback_received);
            paramIndex++;
        }
        
        // Increment interview count if moving to interview stage
        if (status === 'interview' || status === 'final interview') {
            updates.push(`interviews_count = COALESCE(interviews_count, 0) + 1`);
        }
        
        const updateQuery = `
            UPDATE applications 
            SET ${updates.join(', ')}
            WHERE id = $2 AND user_id = $3
            RETURNING id, status
        `;
        
        const result = await db.query(updateQuery, values);
        
        if (result.rows.length === 0) {
            return res.status(404).send("Application not found or unauthorized");
        }
        
        // Log the status change
        await db.query(`
            INSERT INTO communication_logs (application_id, communication_type, direction, content, created_at)
            VALUES ($1, 'status_change', 'system', $2, CURRENT_TIMESTAMP)
        `, [id, `Status updated to: ${status}`]);
        
        res.redirect(`/applications/view/${id}`);
        
    } catch (err) {
        console.error('Error updating status:', err);
        res.status(500).render('error', { message: "Error updating status: " + err.message });
    }
});

// GET: View single application with enhanced data
router.get('/view/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get application with interview rounds
        const appResult = await db.query(`
            SELECT a.*, 
                   COALESCE(
                       json_agg(ir.* ORDER BY ir.round_number) FILTER (WHERE ir.id IS NOT NULL),
                       '[]'
                   ) as interview_rounds
            FROM applications a
            LEFT JOIN interview_rounds ir ON a.id = ir.application_id
            WHERE a.id = $1 AND a.user_id = $2
            GROUP BY a.id
        `, [id, req.session.userId]);

        if (appResult.rows.length === 0) {
            return res.status(404).render('error', { message: "Application not found or unauthorized." });
        }

        const app = appResult.rows[0];
        
        // Parse interview_rounds from JSON if it's a string
        if (app.interview_rounds && typeof app.interview_rounds === 'string') {
            app.interview_rounds = JSON.parse(app.interview_rounds);
        }
        
        // Get communication history - map to 'logs' property for template compatibility
        const commsResult = await db.query(`
            SELECT 
                communication_type as action,
                content as details,
                created_at as date,
                contact_name,
                contact_email,
                direction
            FROM communication_logs 
            WHERE application_id = $1 
            ORDER BY created_at DESC
        `, [id]);
        
        // Attach logs to app object for template compatibility
        app.logs = commsResult.rows;
        
        // Calculate metrics
        const daysSinceApplied = Math.floor((new Date() - new Date(app.date_applied)) / (1000 * 60 * 60 * 24));
        const suggestGhosted = daysSinceApplied > 30 && app.status === 'applied';
        
        const experienceFit = app.your_experience_years >= app.experience_level ? 'good' : 
                             app.your_experience_years >= app.experience_level * 0.7 ? 'partial' : 'low';
        
        // Calculate expected salary vs offered (if available)
        let salaryComparison = null;
        if (app.salary && app.offer_amount) {
            // Simple comparison - could be enhanced with parsing
            salaryComparison = {
                expected: app.salary,
                offered: app.offer_amount,
                match: app.salary.includes(app.offer_amount) || app.offer_amount.includes(app.salary)
            };
        }

        res.render('view-application', { 
            app, 
            suggestGhosted, 
            daysSinceApplied,
            experienceFit,
            salaryComparison,
            user: req.session.userName 
        });
        
    } catch (err) {
        console.error('Error fetching application details:', err);
        res.status(500).render('error', { message: "Error fetching data: " + err.message });
    }
});

// GET: Edit application form
router.get('/edit/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(
            'SELECT * FROM applications WHERE id = $1 AND user_id = $2',
            [id, req.session.userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).render('error', { message: "Application not found or unauthorized." });
        }
        
        res.render('edit-application', { 
            app: result.rows[0],
            user: req.session.userName 
        });
        
    } catch (err) {
        console.error('Error fetching application for edit:', err);
        res.status(500).render('error', { message: "Error fetching data: " + err.message });
    }
});

// POST: Add communication log entry
router.post('/add-note/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { note, communication_type = 'manual_entry', contact_name, contact_email } = req.body;
        
        // Add to structured communication_logs table
        await db.query(`
            INSERT INTO communication_logs (application_id, communication_type, direction, contact_name, contact_email, content, created_at)
            VALUES ($1, $2, 'outbound', $3, $4, $5, CURRENT_TIMESTAMP)
        `, [id, communication_type, contact_name || null, contact_email || null, note]);
        
        // Also append to legacy notes field for backward compatibility
        const timestamp = new Date().toLocaleString();
        const formattedNote = `\n[${timestamp}] ${note}`;
        
        await db.query(
            'UPDATE applications SET notes = COALESCE(notes, \'\') || $1 WHERE id = $2 AND user_id = $3',
            [formattedNote, id, req.session.userId]
        );
        
        // Update follow-up tracking if applicable
        if (communication_type === 'follow_up_email') {
            await db.query(`
                UPDATE applications 
                SET follow_up_count = COALESCE(follow_up_count, 0) + 1,
                    last_follow_up_date = CURRENT_DATE
                WHERE id = $1
            `, [id]);
        }
        
        res.redirect(`/applications/view/${id}`);
        
    } catch (err) {
        console.error('Error adding note:', err);
        res.status(500).render('error', { message: "Error saving note: " + err.message });
    }
});

// GET: Analytics (enhanced)
router.get('/analytics', async (req, res) => {
    try {
        // Method performance with trend
        const methodStats = await db.query(`
            SELECT 
                app_method, 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status IN ('interview', 'final interview', 'offer_received', 'shortlisted', 'phone screen')) as positive,
                COUNT(*) FILTER (WHERE status = 'offer received') as offers,
                AVG(response_time_days) FILTER (WHERE response_time_days IS NOT NULL) as avg_response_days,
                AVG(time_spent_minutes) as avg_time_invested
            FROM applications 
            WHERE user_id = $1
            GROUP BY app_method
            ORDER BY total DESC
        `, [req.session.userId]);
        
        // Response time analysis
        const responseTime = await db.query(`
            SELECT 
                AVG(response_time_days) as avg_days,
                MIN(response_time_days) as min_days,
                MAX(response_time_days) as max_days,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_days) as median_days
            FROM applications 
            WHERE user_id = $1 
            AND response_time_days IS NOT NULL
        `, [req.session.userId]);
        
        // Rejection stage analysis (where you lose opportunities)
        const rejectionAnalysis = await db.query(`
            SELECT 
                rejection_stage,
                COUNT(*) as count,
                AVG(EXTRACT(DAY FROM (CURRENT_DATE - date_applied))) as avg_days_before_rejection
            FROM applications 
            WHERE user_id = $1 
            AND status = 'rejected'
            AND rejection_stage IS NOT NULL
            GROUP BY rejection_stage
        `, [req.session.userId]);
        
        // Monthly trend
        const monthlyTrend = await db.query(`
            SELECT 
                TO_CHAR(DATE_TRUNC('month', date_applied), 'YYYY-MM') as month, 
                COUNT(*) as count,
                COUNT(*) FILTER (WHERE status = 'offer received') as offers,
                COUNT(*) FILTER (WHERE status = 'rejected') as rejections
            FROM applications 
            WHERE user_id = $1 
            AND date_applied IS NOT NULL
            AND date_applied > CURRENT_DATE - INTERVAL '12 months'
            GROUP BY DATE_TRUNC('month', date_applied)
            ORDER BY month DESC
        `, [req.session.userId]);
        
        // Resume version A/B testing
        const resumePerformance = await db.query(`
            SELECT 
                resume_version_used,
                COUNT(*) as uses,
                COUNT(*) FILTER (WHERE status = 'offer received') as offers,
                AVG(CASE WHEN status = 'offer received' THEN 1 ELSE 0 END) * 100 as success_rate
            FROM applications 
            WHERE user_id = $1 
            AND resume_version_used IS NOT NULL
            GROUP BY resume_version_used
        `, [req.session.userId]);
        
        res.render('analytics', {
            methodStats: methodStats.rows,
            responseTime: responseTime.rows[0] || {},
            rejectionAnalysis: rejectionAnalysis.rows,
            monthlyTrend: monthlyTrend.rows,
            resumePerformance: resumePerformance.rows,
            user: req.session.userName
        });
        
    } catch (err) {
        console.error('Analytics error:', err);
        res.status(500).render('error', { message: `Analytics error: ${err.message}` });
    }
});

// GET: AI Analytics (enhanced with more data points)
router.get('/ai-analytics', async (req, res) => {
    try {
        const appsResult = await db.query(
            `SELECT * FROM applications 
             WHERE user_id = $1 
             ORDER BY date_applied DESC`,
            [req.session.userId]
        );
        
        const applications = appsResult.rows.map(app => ({
            id: app.id,
            company_name: app.company_name,
            job_title: app.job_title,
            status: app.status || 'applied',
            date_applied: app.date_applied ? app.date_applied.toISOString() : new Date().toISOString(),
            last_contact_date: app.last_contact_date ? app.last_contact_date.toISOString() : null,
            app_method: app.app_method || 'Unknown',
            job_level: app.job_level || 'Unknown',
            experience_level: parseInt(app.experience_level) || 0,
            your_experience_years: parseInt(app.your_experience_years) || 0,
            job_domain: Array.isArray(app.job_domain) ? app.job_domain : [],
            required_skills: Array.isArray(app.required_skills) ? app.required_skills : [],
            skills_you_have: Array.isArray(app.skills_you_have) ? app.skills_you_have : [],
            skills_you_lack: Array.isArray(app.skills_you_lack) ? app.skills_you_lack : [],
            tailored_resume: app.tailored_resume === true,
            referral: app.referral === true,
            assessment_upfront: app.assessment_upfront === true,
            assessment_type: app.assessment_type,
            time_spent_minutes: parseInt(app.time_spent_minutes) || 0,
            industry: app.industry,
            work_arrangement: app.work_arrangement || 'Unknown',
            salary: app.salary,
            company_size: app.company_size,
            company_rating: app.company_rating,
            response_time_days: app.response_time_days,
            interviews_count: app.interviews_count || 0,
            follow_up_count: app.follow_up_count || 0
        }));

        const basicAnalytics = calculateBasicAnalytics(applications);
        
        let aiAnalysis = null;
        let aiConnected = false;
        
        try {
            const response = await axios.post('http://127.0.0.1:8000/api/analyze', {
                user_id: req.session.userId,
                applications: applications
            }, { timeout: 5000 });
            
            aiAnalysis = response.data;
            aiConnected = true;
            
        } catch (aiError) {
            console.log('Python AI service unavailable, using basic analytics:', aiError.message);
            aiAnalysis = generateFallbackAnalysis(applications, basicAnalytics);
        }

        res.render('ai-analytics', {
            analysis: aiAnalysis,
            basicStats: basicAnalytics,
            applications: applications,
            user: req.session.userName,
            aiConnected: aiConnected,
            hasData: applications.length > 0
        });
        
    } catch (err) {
        console.error('AI Analytics error:', err);
        res.status(500).render('error', { message: `Error: ${err.message}` });
    }
});

// Helper functions (same as before, enhanced)
function calculateBasicAnalytics(apps) {
    if (apps.length === 0) {
        return {
            total: 0,
            offers: 0,
            interviews: 0,
            active: 0,
            interviewRate: 0,
            byMethod: [],
            byStatus: {},
            avgResponseTime: 0,
            referralSuccessRate: 0
        };
    }
    
    const total = apps.length;
    const offers = apps.filter(a => a.status === 'offer received').length;
    const interviews = apps.filter(a => ['interview', 'final interview', 'phone screen'].includes(a.status)).length;
    const active = apps.filter(a => !['offer received', 'rejected', 'ghosted', 'withdrawn'].includes(a.status)).length;
    
    const methodGroups = {};
    apps.forEach(app => {
        const method = app.app_method || 'Unknown';
        if (!methodGroups[method]) {
            methodGroups[method] = { total: 0, positive: 0, offers: 0 };
        }
        methodGroups[method].total++;
        if (['interview', 'final interview', 'offer received', 'shortlisted'].includes(app.status)) {
            methodGroups[method].positive++;
        }
        if (app.status === 'offer received') {
            methodGroups[method].offers++;
        }
    });
    
    const byMethod = Object.entries(methodGroups).map(([method, data]) => ({
        channel: method,
        applications: data.total,
        positive_outcomes: data.positive,
        offers: data.offers,
        success_rate: Math.round((data.positive / data.total) * 100) || 0,
        offer_rate: Math.round((data.offers / data.total) * 100) || 0
    })).sort((a, b) => b.success_rate - a.success_rate);
    
    const byStatus = {};
    apps.forEach(app => {
        byStatus[app.status] = (byStatus[app.status] || 0) + 1;
    });
    
    // Calculate referral success rate
    const referrals = apps.filter(a => a.referral);
    const referralOffers = referrals.filter(a => a.status === 'offer received').length;
    const referralSuccessRate = referrals.length > 0 ? Math.round((referralOffers / referrals.length) * 100) : 0;
    
    // Average response time
    const responseTimes = apps.filter(a => a.response_time_days !== null).map(a => a.response_time_days);
    const avgResponseTime = responseTimes.length > 0 ? 
        Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0;
    
    return {
        total,
        offers,
        interviews,
        active,
        interviewRate: Math.round((interviews / total) * 100) || 0,
        offerRate: Math.round((offers / total) * 100) || 0,
        byMethod,
        byStatus,
        avgResponseTime,
        referralSuccessRate,
        tailoredRate: Math.round((apps.filter(a => a.tailored_resume).length / total) * 100)
    };
}

function generateFallbackAnalysis(apps, stats) {
    const recommendations = [];
    
    // Tailoring analysis
    const tailoredRate = apps.filter(a => a.tailored_resume).length / Math.max(apps.length, 1);
    if (tailoredRate < 0.3 && apps.length > 5) {
        recommendations.push({
            priority: "HIGH",
            category: "Documentation",
            issue: "Low resume tailoring rate",
            action: "Customize resume for each application. Generic resumes get 80% fewer callbacks.",
            expected_impact: "3x increase in screening rate",
            timeframe: "Immediate"
        });
    }
    
    // Ghosting analysis
    const ghosted = apps.filter(a => a.status === 'ghosted').length;
    const closed = apps.filter(a => ['ghosted', 'rejected', 'offer received'].includes(a.status)).length;
    if (closed > 0 && ghosted / closed > 0.5) {
        recommendations.push({
            priority: "CRITICAL",
            category: "Channel Strategy",
            issue: "High ghosting rate - applications not reaching decision makers",
            action: "Prioritize referrals and LinkedIn direct outreach over job boards",
            expected_impact: "5x response rate improvement",
            timeframe: "This week"
        });
    }
    
    // Follow-up analysis
    const needsFollowup = apps.filter(a => {
        if (['offer received', 'rejected', 'ghosted', 'withdrawn'].includes(a.status)) return false;
        const applied = new Date(a.date_applied);
        const daysSince = (new Date() - applied) / (1000 * 60 * 60 * 24);
        return daysSince > 14 && (a.follow_up_count || 0) === 0;
    }).length;
    
    if (needsFollowup > 0) {
        recommendations.push({
            priority: "MEDIUM",
            category: "Process",
            issue: `${needsFollowup} applications need follow-up`,
            action: `Send polite follow-up emails to re-engage recruiters`,
            expected_impact: `20-30% revival rate`,
            timeframe: "Today"
        });
    }
    
    // Referral leverage
    const referrals = apps.filter(a => a.referral);
    if (referrals.length < 3 && apps.length > 10) {
        recommendations.push({
            priority: "HIGH",
            category: "Networking",
            issue: "Low referral usage",
            action: "Increase referral requests. Referrals have 10x higher response rates.",
            expected_impact: "3-5x more interviews",
            timeframe: "This week"
        });
    }
    
    // Response time analysis
    if (stats.avgResponseTime > 21) {
        recommendations.push({
            priority: "MEDIUM",
            category: "Targeting",
            issue: "Slow average response time",
            action: "Focus on companies with faster response rates or follow up sooner",
            expected_impact: "Faster pipeline progression",
            timeframe: "Ongoing"
        });
    }
    
    let healthScore = 50;
    if (stats.offers > 0) healthScore += 20;
    if (stats.interviewRate > 10) healthScore += 15;
    if (tailoredRate > 0.5) healthScore += 15;
    if (stats.byMethod.length > 2) healthScore += 10;
    if (stats.referralSuccessRate > 30) healthScore += 10;
    healthScore = Math.min(100, healthScore);
    
    let diagnosis = "Your application pipeline is operational.";
    if (healthScore < 30) diagnosis = "Critical issues detected. Immediate strategy adjustment required.";
    else if (healthScore < 50) diagnosis = "Significant inefficiencies in application approach.";
    else if (healthScore < 70) diagnosis = "Moderate performance. Optimization opportunities available.";
    else diagnosis = "Strong application strategy. Minor refinements suggested.";
    
    return {
        executive_summary: {
            pipeline_health_score: healthScore,
            total_applications: stats.total,
            active_applications: stats.active,
            offers_received: stats.offers,
            interview_rate: stats.interviewRate,
            offer_rate: stats.offerRate,
            avg_response_time_days: stats.avgResponseTime,
            referral_success_rate: stats.referralSuccessRate,
            ai_diagnosis: diagnosis,
            conversion_funnel: {
                applied_to_screen: Math.round((stats.interviews + stats.offers) / stats.total * 100) || 0,
                screen_to_interview: Math.round(stats.interviews / Math.max(stats.interviews + stats.offers, 1) * 100) || 0,
                interview_to_offer: Math.round(stats.offers / Math.max(stats.interviews, 1) * 100) || 0
            }
        },
        channel_performance: stats.byMethod.map(m => ({
            channel: m.channel,
            applications: m.applications,
            positive_outcomes: m.positive_outcomes,
            success_rate: m.success_rate,
            recommendation: m.success_rate > 30 ? "High performer - prioritize" : m.success_rate > 10 ? "Maintain current volume" : "Review approach or deprioritize"
        })),
        actionable_recommendations: recommendations,
        predictive_models: {
            status: apps.length < 10 ? "INSUFFICIENT_DATA" : "BASIC_MODE",
            message: apps.length < 10 ? `Apply to ${10 - apps.length} more positions for ML insights` : "Python AI service offline - using statistical analysis"
        }
    };
}

// POST: Predict success (enhanced)
router.post('/predict-success', async (req, res) => {
    try {
        const prediction = await axios.post('http://localhost:8000/api/predict', req.body);
        res.json(prediction.data);
    } catch (err) {
        // Fallback prediction logic
        const { experience_required, your_experience, tailored_resume, referral, app_method } = req.body;
        
        let score = 50;
        
        // Experience fit
        const ratio = your_experience / Math.max(experience_required, 1);
        if (ratio >= 0.8 && ratio <= 1.2) score += 20;
        else if (ratio >= 0.5) score += 5;
        else score -= 15;
        
        // Resume quality
        if (tailored_resume) score += 15;
        
        // Network effect
        if (referral) score += 20;
        
        // Channel quality
        const channelScores = { 'Referral': 10, 'LinkedIn': 5, 'Company Website': 5, 'Indeed': -5 };
        score += (channelScores[app_method] || 0);
        
        res.json({
            success_probability: Math.max(0, Math.min(100, score)),
            confidence: "low (AI service offline)",
            key_factors: {
                experience_fit: ratio >= 0.8 ? "optimal" : ratio >= 0.5 ? "partial" : "poor",
                tailored_resume: tailored_resume || false,
                referral: referral || false
            }
        });
    }
});

// POST: Log Communication
router.post('/log-comm/:id', async (req, res) => {
    const { action, details } = req.body;
    const appId = req.params.id;

    try {
        // Maps the form's 'action' to 'communication_type' and 'details' to 'content'
        await db.query(
            `INSERT INTO communication_logs 
             (application_id, communication_type, content, created_at) 
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
            [appId, action, details]
        );
        res.redirect(`/applications/view/${appId}`);
    } catch (err) {
        console.error('Error logging communication:', err.message);
        res.status(500).send('Server Error');
    }
});

// POST: Add Interview Round
router.post('/add-interview/:id', async (req, res) => {
    const { round_name, date, interviewers, format } = req.body;
    const appId = req.params.id;

    try {
        // 1. Calculate the next round_number dynamically
        const countResult = await db.query(
            'SELECT COUNT(*) FROM interview_rounds WHERE application_id = $1',
            [appId]
        );
        const nextRoundNumber = parseInt(countResult.rows[0].count) + 1;

        // 2. Insert the new round. 
        // Note: The form includes 'round_name', but the DB uses 'round_number'. 
        // This stores the custom name in the 'notes' column to preserve it.
        await db.query(
            `INSERT INTO interview_rounds 
             (application_id, round_number, interview_type, interview_date, interviewer_names, notes) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                appId, 
                nextRoundNumber, 
                format, // maps to interview_type
                date, 
                interviewers, 
                `Round Title: ${round_name}` // saves the custom name from the UI
            ]
        );
        
        res.redirect(`/applications/view/${appId}`);
    } catch (err) {
        console.error('Error adding interview round:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;