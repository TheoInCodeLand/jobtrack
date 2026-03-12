const express = require('express');
const router = express.Router();
const db = require('../database/db'); 
const multer = require('multer');
const path = require('path');
const axios = require('axios');

const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: function(req, file, cb) {
    cb(null, 'resume-' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

router.get('/add', (req, res) => {
    res.render('add-application');
});

router.post('/add', upload.single('resume'), async (req, res) => {
    try {
        let {
            company_name, job_title, experience_level, job_domain,
            job_level, app_method, app_method_other, date_applied, closing_date,
            company_size, education_required, location, salary, referral, 
            notes, job_description, required_skills, work_arrangement, 
            industry, time_spent_minutes, tailored_resume, assessment_upfront,
            company_website, job_posting_url, hiring_manager_name, 
            hiring_manager_email, hiring_manager_linkedin, recruiter_name,
            recruiter_company, follow_up_date, your_experience_years,
            assessment_type
        } = req.body;

        const finalMethod = app_method === 'Other' ? app_method_other : app_method;
        const resume_path = req.file ? `/uploads/${req.file.filename}` : null;
        const domainArray = job_domain ? job_domain.split(',').map(item => item.trim()).filter(Boolean) : [];
        const skillsArray = required_skills ? required_skills.split(',').map(item => item.trim()).filter(Boolean) : [];
        const isTailored = tailored_resume === 'true';
        const isAssessment = assessment_upfront === 'true';
        const isReferral = referral === 'yes';

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
                assessment_type, status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 
                $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
                $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34
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
            assessment_type || null, 'applied'
        ];

        const result = await db.query(queryText, values);
        
        res.redirect(`/applications/view/${result.rows[0].id}`);
        
    } catch (err) {
        console.error('Error saving application:', err);
        res.status(500).render('error', { message: "Error saving application. Please try again." });
    }
});

router.get('/dashboard', async (req, res) => {
    try {
        const { status, sort = 'date_applied', order = 'DESC' } = req.query;
        
        let query = 'SELECT * FROM applications WHERE user_id = $1';
        const params = [req.session.userId];
        
        if (status && status !== 'all') {
            query += ' AND status = $2';
            params.push(status);
        }
        
        const allowedSorts = ['date_applied', 'company_name', 'status', 'closing_date'];
        const sortBy = allowedSorts.includes(sort) ? sort : 'date_applied';
        const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
        
        query += ` ORDER BY ${sortBy} ${sortOrder}`;
        
        const result = await db.query(query, params);
        
        const statsQuery = await db.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'applied') as applied,
                COUNT(*) FILTER (WHERE status IN ('shortlisted', 'interview', 'final interview')) as in_progress,
                COUNT(*) FILTER (WHERE status = 'offer received') as offers,
                COUNT(*) FILTER (WHERE status IN ('rejected', 'ghosted')) as closed,
                COUNT(*) FILTER (WHERE follow_up_date <= CURRENT_DATE AND status NOT IN ('offer received', 'rejected', 'ghosted', 'withdrawn')) as needs_followup
            FROM applications 
            WHERE user_id = $1
        `, [req.session.userId]);
        
        res.render('dashboard', { 
            apps: result.rows, 
            stats: statsQuery.rows[0],
            currentFilter: status || 'all',
            user: req.session.userName 
        });
        
    } catch (err) {
        console.error('Error fetching applications:', err);
        res.status(500).send("Error fetching data.");
    }
});

router.post('/update-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const updateQuery = `
            UPDATE applications 
            SET status = $1, 
                last_contact_date = CASE 
                    WHEN $1 IN ('interview', 'final interview', 'offer received') THEN CURRENT_DATE 
                    ELSE last_contact_date 
                END
            WHERE id = $2 AND user_id = $3
        `;
        
        await db.query(updateQuery, [status, id, req.session.userId]);
        
        res.redirect('/applications/dashboard');
        
    } catch (err) {
        console.error('Error updating status:', err);
        res.status(500).send("Error updating status.");
    }
});

router.get('/view/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(
            'SELECT * FROM applications WHERE id = $1 AND user_id = $2', 
            [id, req.session.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).send("Application not found or unauthorized.");
        }

        const app = result.rows[0];
        
        const daysSinceApplied = Math.floor((new Date() - new Date(app.date_applied)) / (1000 * 60 * 60 * 24));
        const suggestGhosted = daysSinceApplied > 30 && app.status === 'applied';
        
        const experienceFit = app.your_experience_years >= app.experience_level ? 'good' : 
                             app.your_experience_years >= app.experience_level * 0.7 ? 'partial' : 'low';

        res.render('view-application', { 
            app, 
            suggestGhosted, 
            daysSinceApplied,
            experienceFit,
            user: req.session.userName 
        });
        
    } catch (err) {
        console.error('Error fetching application details:', err);
        res.status(500).send("Error fetching data.");
    }
});

router.post('/add-note/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { note } = req.body;
        
        const timestamp = new Date().toLocaleString();
        const formattedNote = `\n[${timestamp}] ${note}`;
        
        await db.query(
            'UPDATE applications SET notes = COALESCE(notes, \'\') || $1 WHERE id = $2 AND user_id = $3',
            [formattedNote, id, req.session.userId]
        );
        
        res.redirect(`/applications/view/${id}`);
        
    } catch (err) {
        console.error('Error adding note:', err);
        res.status(500).send("Error saving note.");
    }
});

router.get('/analytics', async (req, res) => {
    try {
        const methodStats = await db.query(`
            SELECT app_method, 
                   COUNT(*) as total,
                   COUNT(*) FILTER (WHERE status IN ('interview', 'final interview', 'offer received', 'shortlisted', 'phone screen')) as positive,
                   COUNT(*) FILTER (WHERE status = 'offer received') as offers
            FROM applications 
            WHERE user_id = $1
            GROUP BY app_method
            ORDER BY total DESC
        `, [req.session.userId]);
        
        const responseTime = await db.query(`
            SELECT AVG(
                last_contact_date - date_applied
            ) as avg_days
            FROM applications 
            WHERE user_id = $1 
            AND last_contact_date IS NOT NULL 
            AND date_applied IS NOT NULL
        `, [req.session.userId]);
        
        const monthlyTrend = await db.query(`
            SELECT 
                TO_CHAR(DATE_TRUNC('month', date_applied), 'YYYY-MM-DD') as month, 
                COUNT(*) as count
            FROM applications 
            WHERE user_id = $1 
            AND date_applied IS NOT NULL
            AND date_applied > CURRENT_DATE - INTERVAL '6 months'
            GROUP BY DATE_TRUNC('month', date_applied)
            ORDER BY month DESC
        `, [req.session.userId]);
        
        let avgResponseTime = 0;
        if (responseTime.rows[0] && responseTime.rows[0].avg_days) {
            avgResponseTime = parseFloat(responseTime.rows[0].avg_days);
        }
        
        res.render('analytics', {
            methodStats: methodStats.rows,
            avgResponseTime: avgResponseTime,
            monthlyTrend: monthlyTrend.rows,
            user: req.session.userName
        });
        
    } catch (err) {
        console.error('Analytics error:', err);
        res.status(500).send(`Analytics error: ${err.message}`);
    }
});

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
            tailored_resume: app.tailored_resume === true,
            referral: app.referral === true,
            assessment_upfront: app.assessment_upfront === true,
            assessment_type: app.assessment_type,
            time_spent_minutes: parseInt(app.time_spent_minutes) || 0,
            industry: app.industry,
            work_arrangement: app.work_arrangement || 'Unknown',
            salary: app.salary,
            company_size: app.company_size
        }));

        const basicAnalytics = calculateBasicAnalytics(applications);
        
        let aiAnalysis = null;
        let aiConnected = false;
        
        try {
            const response = await axios.post('http://localhost:8000/api/analyze', {
                user_id: req.session.userId,
                applications: applications
            }, { timeout: 5000 }); // 5 second timeout
            
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
        res.status(500).send(`Error: ${err.message}`);
    }
});

function calculateBasicAnalytics(apps) {
    if (apps.length === 0) {
        return {
            total: 0,
            offers: 0,
            interviews: 0,
            active: 0,
            interviewRate: 0,
            byMethod: [],
            byStatus: {}
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
            methodGroups[method] = { total: 0, positive: 0 };
        }
        methodGroups[method].total++;
        if (['interview', 'final interview', 'offer received', 'shortlisted'].includes(app.status)) {
            methodGroups[method].positive++;
        }
    });
    
    const byMethod = Object.entries(methodGroups).map(([method, data]) => ({
        channel: method,
        applications: data.total,
        positive_outcomes: data.positive,
        success_rate: Math.round((data.positive / data.total) * 100) || 0
    })).sort((a, b) => b.success_rate - a.success_rate);
    
    const byStatus = {};
    apps.forEach(app => {
        byStatus[app.status] = (byStatus[app.status] || 0) + 1;
    });
    
    return {
        total,
        offers,
        interviews,
        active,
        interviewRate: Math.round((interviews / total) * 100) || 0,
        byMethod,
        byStatus
    };
}

// Generate AI-like analysis when Python is offline
function generateFallbackAnalysis(apps, stats) {
    const recommendations = [];
    
    // Check for spray-and-pray
    const tailoredRate = apps.filter(a => a.tailored_resume).length / Math.max(apps.length, 1);
    if (tailoredRate < 0.3 && apps.length > 5) {
        recommendations.push({
            priority: "HIGH",
            category: "Strategy",
            issue: "Low resume tailoring rate",
            action: "Customize resume for each application. Generic resumes get 80% fewer callbacks.",
            expected_impact: "3x increase in screening rate",
            timeframe: "Immediate"
        });
    }
    
    // Check ghosting rate
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
    
    // Check follow-ups needed
    const needsFollowup = apps.filter(a => {
        if (['offer received', 'rejected', 'ghosted', 'withdrawn'].includes(a.status)) return false;
        const applied = new Date(a.date_applied);
        const daysSince = (new Date() - applied) / (1000 * 60 * 60 * 24);
        return daysSince > 14;
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
    
    let healthScore = 50;
    if (stats.offers > 0) healthScore += 20;
    if (stats.interviewRate > 10) healthScore += 15;
    if (tailoredRate > 0.5) healthScore += 15;
    if (stats.byMethod.length > 2) healthScore += 10;
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

router.post('/predict-success', async (req, res) => {
    try {
        const prediction = await axios.post('http://localhost:8000/api/predict', req.body);
        res.json(prediction.data);
    } catch (err) {
        res.status(500).json({ error: "Prediction service unavailable" });
    }
});

module.exports = router;