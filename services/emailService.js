const nodemailer = require('nodemailer');

// Create transporter (configure with your email provider)
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail', // or 'outlook', 'yahoo', etc.
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER, // your email address
        pass: process.env.EMAIL_PASS  // app password (not your regular password)
    }
});

// Verify connection
transporter.verify((error, success) => {
    if (error) {
        console.error('SMTP connection error:', error);
    } else {
        console.log('Email server ready to send messages');
    }
});

/**
 * Send application confirmation email
 */
const sendApplicationConfirmation = async (userEmail, applicationData) => {
    const {
        company_name,
        job_title,
        job_level,
        location,
        salary,
        app_method,
        date_applied,
        follow_up_date,
        company_rating,
        tailored_resume,
        referral,
        skills_match_percentage
    } = applicationData;

    const mailOptions = {
        from: `"Job Application Tracker" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: `Application Submitted: ${job_title} at ${company_name}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">Application Submitted!</h1>
                </div>
                
                <div style="padding: 30px; background: #ffffff; border: 1px solid #e0e0e0; border-top: none;">
                    <h2 style="color: #667eea; margin-top: 0;">${job_title}</h2>
                    <h3 style="color: #666; font-weight: normal; margin-bottom: 20px;">${company_name}</h3>
                    
                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; width: 40%;">Job Level:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #eee;">${job_level || 'Not specified'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Location:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #eee;">${location || 'Not specified'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Salary Range:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #eee;">${salary || 'Not disclosed'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Application Method:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #eee;">${app_method}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Date Applied:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #eee;">${new Date(date_applied).toLocaleDateString()}</td>
                        </tr>
                        ${follow_up_date ? `
                        <tr style="background: #fff3cd;">
                            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; color: #856404;">Follow-up Date:</td>
                            <td style="padding: 10px; border-bottom: 1px solid #eee; color: #856404;">${new Date(follow_up_date).toLocaleDateString()}</td>
                        </tr>
                        ` : ''}
                    </table>

                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <h4 style="margin-top: 0; color: #333;">Application Quality Metrics:</h4>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li>Your Interest Rating: ${company_rating || '5'}/10</li>
                            <li>Tailored Resume: ${tailored_resume ? 'Yes' : 'No'}</li>
                            <li>Referral: ${referral ? 'Yes' : 'No'}</li>
                            ${skills_match_percentage ? `<li>Skills Match: ${skills_match_percentage}%</li>` : ''}
                        </ul>
                    </div>

                    ${follow_up_date ? `
                    <div style="background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <strong>⏰ Auto Reminder Enabled!</strong><br>
                        You'll receive a follow-up reminder on <strong>${new Date(follow_up_date).toLocaleDateString()}</strong>.
                    </div>
                    ` : ''}

                    <p style="margin-top: 30px; font-size: 14px; color: #666; text-align: center;">
                        Track your application at: <a href="${process.env.APP_URL || 'http://localhost:3000'}/applications/view/${applicationData.id}" style="color: #667eea;">View Application</a>
                    </p>
                </div>
                
                <div style="background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px;">
                    <p>You're receiving this because you applied to a job via your Job Application Tracker.</p>
                </div>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Application confirmation email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending confirmation email:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send follow-up reminder email
 */
const sendFollowUpReminder = async (userEmail, applicationData) => {
    const { company_name, job_title, hiring_manager_name, app_method, date_applied, days_since_applied } = applicationData;

    const mailOptions = {
        from: `"Job Application Tracker" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: `Follow-up Reminder: ${job_title} at ${company_name}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <div style="background: #ffc107; padding: 30px; text-align: center; color: #212529; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">Time to Follow Up!</h1>
                </div>
                
                <div style="padding: 30px; background: #ffffff; border: 1px solid #e0e0e0; border-top: none;">
                    <p style="font-size: 16px;">Hi there,</p>
                    
                    <p>You applied to <strong>${job_title}</strong> at <strong>${company_name}</strong> 
                    <strong>${days_since_applied}</strong> days ago (${new Date(date_applied).toLocaleDateString()}).</p>
                    
                    <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                        <strong>Suggested Action:</strong> Send a polite follow-up email to re-engage the hiring team.
                    </div>

                    <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
                        <h4 style="margin-top: 0;">Application Details:</h4>
                        <ul style="line-height: 1.8;">
                            <li><strong>Company:</strong> ${company_name}</li>
                            <li><strong>Position:</strong> ${job_title}</li>
                            <li><strong>Applied:</strong> ${new Date(date_applied).toLocaleDateString()} (${days_since_applied} days ago)</li>
                            <li><strong>Method:</strong> ${app_method}</li>
                            ${hiring_manager_name ? `<li><strong>Hiring Manager:</strong> ${hiring_manager_name}</li>` : ''}
                        </ul>
                    </div>

                    <div style="background: #e7f3ff; border: 1px solid #b8daff; padding: 20px; border-radius: 6px; margin: 20px 0;">
                        <h4 style="margin-top: 0; color: #004085;">📝 Suggested Follow-up Template:</h4>
                        <p style="font-style: italic; color: #004085; line-height: 1.6;">
                            "Dear ${hiring_manager_name || 'Hiring Manager'},<br><br>
                            I hope this message finds you well. I wanted to follow up on my application for the ${job_title} position 
                            that I submitted on ${new Date(date_applied).toLocaleDateString()}. I'm very excited about the opportunity 
                            to join ${company_name} and would welcome the chance to discuss how my skills align with your team's needs.<br><br>
                            Thank you for your time and consideration.<br><br>
                            Best regards"
                        </p>
                    </div>

                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.APP_URL || 'http://localhost:3000'}/applications/view/${applicationData.id}" 
                           style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                            View Application Details
                        </a>
                    </div>

                    <p style="font-size: 14px; color: #666; margin-top: 30px;">
                        <strong>Tip:</strong> Studies show that polite follow-ups can increase response rates by 20-30%!
                    </p>
                </div>
                
                <div style="background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px;">
                    <p>This is an automated reminder from your Job Application Tracker.</p>
                    <p>To disable reminders, update your application settings.</p>
                </div>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Follow-up reminder sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending follow-up reminder:', error);
        return { success: false, error: error.message };
    }
};

const sendVerificationEmail = async (email, token, fullName) => {
    const verificationUrl = `${process.env.APP_URL}/auth/verify-email?token=${token}`;
    
    const mailOptions = {
        from: `"Jobtrack" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify your Jobtrack account',
        html: `
            <div style="font-family: 'DM Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h2 style="color: #171717; font-weight: 400; margin: 0;">Welcome to Jobtrack</h2>
                </div>
                
                <p style="color: #737373; font-size: 16px; line-height: 1.6;">
                    Hi ${fullName},
                </p>
                
                <p style="color: #737373; font-size: 16px; line-height: 1.6;">
                    Thanks for signing up! Please verify your email address to activate your account and start tracking your job applications.
                </p>
                
                <div style="text-align: center; margin: 40px 0;">
                    <a href="${verificationUrl}" 
                       style="display: inline-block; padding: 16px 32px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500;">
                        Verify Email Address
                    </a>
                </div>
                
                <p style="color: #737373; font-size: 14px; line-height: 1.6;">
                    Or copy and paste this link into your browser:
                </p>
                
                <p style="color: #171717; font-size: 14px; word-break: break-all; background-color: #f5f5f5; padding: 12px; border-radius: 4px;">
                    ${verificationUrl}
                </p>
                
                <p style="color: #737373; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                    This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
                </p>
                
                <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;">
                
                <p style="color: #a3a3a3; font-size: 12px; text-align: center;">
                    © 2026 Jobtrack (pty) ltd. All rights reserved.
                </p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

const sendWelcomeEmail = async (email, fullName) => {
    const mailOptions = {
        from: `"Jobtrack" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your account is verified!',
        html: `
            <div style="font-family: 'DM Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="color: #171717; font-weight: 400; text-align: center;">Account Verified</h2>
                <p style="color: #737373; font-size: 16px; line-height: 1.6; text-align: center;">
                    Hi ${fullName},<br><br>
                    Your email has been verified. You can now log in and start managing your job applications.
                </p>
                <div style="text-align: center; margin: 40px 0;">
                    <a href="${process.env.APP_URL}/auth/login" 
                       style="display: inline-block; padding: 16px 32px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500;">
                        Go to Login
                    </a>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

module.exports = {
    sendApplicationConfirmation,
    sendFollowUpReminder,
    sendVerificationEmail,
    sendWelcomeEmail,
    transporter
};