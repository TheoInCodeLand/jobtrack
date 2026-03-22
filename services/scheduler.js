const cron = require('node-cron');
const db = require('../database/db');
const { sendFollowUpReminder } = require('./emailService');

/**
 * Check for applications needing follow-up and send reminders
 * Runs every day at 9:00 AM
 */
const initFollowUpScheduler = () => {
    console.log('Initializing follow-up reminder scheduler...');

    // Run daily at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
        console.log('🔍 Checking for follow-up reminders...');
        
        try {
            // Find applications where:
            // 1. follow_up_date is today
            // 2. auto_follow_up_enabled is true
            // 3. Status is not closed (not offer received, rejected, ghosted, withdrawn)
            const result = await db.query(`
                SELECT 
                    a.*,
                    u.email as user_email,
                    u.name as user_name,
                    EXTRACT(DAY FROM (CURRENT_DATE - a.date_applied)) as days_since_applied
                FROM applications a
                JOIN users u ON a.user_id = u.id
                WHERE a.follow_up_date = CURRENT_DATE
                AND a.auto_follow_up_enabled = true
                AND a.status NOT IN ('offer received', 'rejected', 'ghosted', 'withdrawn')
                AND (a.last_reminder_sent IS NULL OR a.last_reminder_sent < CURRENT_DATE)
            `);

            console.log(`📧 Found ${result.rows.length} applications needing follow-up reminders`);

            for (const app of result.rows) {
                try {
                    await sendFollowUpReminder(app.user_email, {
                        ...app,
                        days_since_applied: Math.floor(app.days_since_applied)
                    });

                    // Update last_reminder_sent to prevent duplicate sends
                    await db.query(`
                        UPDATE applications 
                        SET last_reminder_sent = CURRENT_TIMESTAMP 
                        WHERE id = $1
                    `, [app.id]);

                    console.log(`Reminder sent for application ${app.id}: ${app.job_title} at ${app.company_name}`);
                } catch (err) {
                    console.error(`Failed to send reminder for application ${app.id}:`, err.message);
                }
            }
        } catch (err) {
            console.error('Error in follow-up scheduler:', err.message);
        }
    }, {
        scheduled: true,
        timezone: "Africa/Johannesburg" // Set your timezone
    });

    console.log('Follow-up scheduler initialized (runs daily at 9:00 AM)');
};

/**
 * Alternative: Check every hour for more precise timing
 */
const initHourlyFollowUpCheck = () => {
    cron.schedule('0 * * * *', async () => {
        // Similar logic but checks if follow_up_date has passed
        // and sends reminders for overdue follow-ups
    });
};

module.exports = {
    initFollowUpScheduler,
    initHourlyFollowUpCheck
};