const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database/db');

// Import Node.js text extraction libraries
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

// API Configuration for both Gemini and Groq
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

/**
 * Clean and normalize extracted text
 */
function cleanText(text) {
    if (!text) return '';
    text = text.replace(/\s+/g, ' ');
    text = text.replace(/[^\w\s\-\+\.\#\@\(\)\,\/\:\;]/g, ' ');
    return text.trim();
}

/**
 * Extract resume text using Node.js libraries
 */
async function extractResumeText(resumePath) {
    if (!fs.existsSync(resumePath)) {
        throw new Error(`File not found: ${resumePath}`);
    }

    const fileExt = path.extname(resumePath).toLowerCase();
    let text = '';
    let fileType = '';

    try {
        if (fileExt === '.pdf') {
            const dataBuffer = fs.readFileSync(resumePath);
            const parser = new PDFParse({ data: dataBuffer });
            const result = await parser.getText();
            await parser.destroy();
            text = result.text;
            fileType = 'pdf';
        } else if (fileExt === '.docx' || fileExt === '.doc') {
            const result = await mammoth.extractRawText({ path: resumePath });
            text = result.value;
            fileType = fileExt === '.docx' ? 'docx' : 'doc';
        } else {
            throw new Error(`Unsupported file type: ${fileExt}. Only PDF, DOCX, and DOC are supported.`);
        }

        const cleanedText = cleanText(text);
        const wordCount = cleanedText.split(/\s+/).filter(word => word.length > 0).length;
        const charCount = cleanedText.length;

        return {
            success: true,
            text: cleanedText,
            word_count: wordCount,
            char_count: charCount,
            file_type: fileType
        };

    } catch (error) {
        throw new Error(`Extraction failed: ${error.message}`);
    }
}

/**
 * Unified AI analysis function - works with Groq or Gemini
 */
async function analyzeWithAI(params) {
    const { resumeText, jobDescription, jobLevel, jobType, applicationData } = params;
    
    const useGroq = GROQ_API_KEY && (process.env.USE_GROQ === 'true' || !GEMINI_API_KEY);
    const useGemini = GEMINI_API_KEY && !useGroq;
    
    if (!useGroq && !useGemini) {
        throw new Error('No AI API configured. Set either GROQ_API_KEY or GEMINI_API_KEY environment variable.');
    }
    
    const prompt = buildSmartATSPrompt(resumeText, jobDescription, jobLevel, jobType, applicationData);
    
    let aiResponse;
    let apiName;
    
    try {
        if (useGroq) {
            apiName = 'Groq';
            console.log(`[AI] Using Groq API with model: ${GROQ_MODEL}`);
            aiResponse = await callGroqAPI(prompt);
        } else {
            apiName = 'Gemini';
            console.log('[AI] Using Gemini API');
            aiResponse = await callGeminiAPI(prompt);
        }
        
        return parseAIResponse(aiResponse, apiName);
        
    } catch (error) {
        console.error(`[AI] ${apiName} API error:`, error.message);
        throw error;
    }
}

/**
 * Call Groq API (OpenAI-compatible format)
 */
async function callGroqAPI(prompt) {
    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are a senior technical recruiter with 20+ years experience. You must respond with ONLY valid JSON. No markdown, no code blocks, no explanatory text.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.2,
            max_tokens: 4000,
            response_format: { type: "json_object" }
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Groq API error: ${JSON.stringify(errorData)}`);
    }
    
    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response structure from Groq API');
    }
    
    return data.choices[0].message.content;
}

/**
 * Call Gemini API (Google format)
 */
async function callGeminiAPI(prompt) {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 8000,
                topP: 0.8,
                topK: 40,
                responseMimeType: "application/json"
            }
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gemini API error: ${JSON.stringify(errorData)}`);
    }
    
    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('Invalid response structure from Gemini API');
    }
    
    return data.candidates[0].content.parts[0].text;
}

/**
 * Parse AI response text into JSON
 */
function parseAIResponse(responseText, apiName) {
    try {
        let jsonString = responseText;
        
        // Remove markdown code blocks
        jsonString = jsonString.replace(/```json\s*/gi, '');
        jsonString = jsonString.replace(/```\s*/gi, '');
        jsonString = jsonString.trim();
        
        // Extract JSON object
        const jsonStart = jsonString.indexOf('{');
        const jsonEnd = jsonString.lastIndexOf('}');
        
        if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
            throw new Error('No valid JSON structure found in response');
        }
        
        jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
        
        // Check for truncation and fix
        if (appearsTruncated(jsonString)) {
            console.warn(`[AI] ${apiName} response appears truncated, attempting to fix...`);
            jsonString = fixTruncatedJson(jsonString);
        }
        
        const parsed = JSON.parse(jsonString);
        return validateAndNormalize(parsed);
        
    } catch (error) {
        console.error(`[AI] Failed to parse ${apiName} response:`, error.message);
        console.error('[AI] Raw response:', responseText.substring(0, 1000));
        
        return {
            parseError: true,
            rawResponse: responseText,
            error: error.message,
            overallScore: 0,
            verdict: {
                rating: 'ERROR',
                summary: 'Failed to parse AI analysis. Please try again.',
                chanceOfGettingJob: 'Unknown'
            },
            strengths: [],
            criticalGaps: [{
                area: 'Parsing Error',
                description: 'The AI response could not be parsed',
                severity: 'High',
                howToFix: 'Try again or switch AI provider'
            }]
        };
    }
}

/**
 * Check if JSON string appears truncated
 */
function appearsTruncated(str) {
    const lastChar = str.trim().slice(-1);
    if (lastChar === ',' || lastChar === ':' || lastChar === '"') return true;
    
    const openBraces = (str.match(/\{/g) || []).length;
    const closeBraces = (str.match(/\}/g) || []).length;
    const openBrackets = (str.match(/\[/g) || []).length;
    const closeBrackets = (str.match(/\]/g) || []).length;
    
    return (openBraces !== closeBraces) || (openBrackets !== closeBrackets);
}

/**
 * Fix truncated JSON
 */
function fixTruncatedJson(str) {
    let fixed = str;
    
    const quotes = (fixed.match(/"/g) || []).length;
    if (quotes % 2 !== 0) {
        fixed += '"';
    }
    
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    for (let i = 0; i < openBraces - closeBraces; i++) {
        fixed += '}';
    }
    
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
        fixed += ']';
    }
    
    if (fixed.endsWith(',')) {
        fixed = fixed.slice(0, -1) + 'null';
    }
    
    if (fixed.endsWith(':')) {
        fixed += 'null';
    }
    
    return fixed;
}

/**
 * Validate and normalize parsed result
 */
function validateAndNormalize(result) {
    if (typeof result.overallScore !== 'number') {
        result.overallScore = parseInt(result.overallScore) || 0;
    }
    
    result.verdict = result.verdict || {};
    result.scoreBreakdown = result.scoreBreakdown || {};
    result.atsOptimization = result.atsOptimization || {};
    result.tailoredAdvice = result.tailoredAdvice || {};
    result.recruiterInsights = result.recruiterInsights || {};
    result.sectionBySectionRecommendations = result.sectionBySectionRecommendations || {};
    
    result.strengths = Array.isArray(result.strengths) ? result.strengths : [];
    result.criticalGaps = Array.isArray(result.criticalGaps) ? result.criticalGaps : [];
    result.priorityActions = Array.isArray(result.priorityActions) ? result.priorityActions : [];
    
    if (result.atsOptimization) {
        result.atsOptimization.keywordsToAdd = result.atsOptimization.keywordsToAdd || [];
        result.atsOptimization.keywordsToEmphasize = result.atsOptimization.keywordsToEmphasize || [];
        result.atsOptimization.formattingIssues = result.atsOptimization.formattingIssues || [];
        result.atsOptimization.actionVerbs = result.atsOptimization.actionVerbs || [];
    }
    
    if (result.recruiterInsights) {
        result.recruiterInsights.redFlags = result.recruiterInsights.redFlags || [];
        result.recruiterInsights.greenFlags = result.recruiterInsights.greenFlags || [];
    }
    
    return result;
}

/**
 * Build comprehensive Smart ATS prompt
 */
function buildSmartATSPrompt(resumeText, jobDescription, jobLevel, jobType, applicationData) {
    const jobLevelContext = {
        'entry': 'Entry-level (0-2 years)',
        'mid': 'Mid-level (3-5 years)', 
        'senior': 'Senior-level (5-8 years)',
        'lead': 'Lead/Principal (8+ years)',
        'executive': 'Executive/C-level'
    };
    
    const jobTypeContext = {
        'software_engineering': 'Software Engineering',
        'data_science': 'Data Science / ML',
        'product_management': 'Product Management',
        'project_management': 'Project Management',
        'devops': 'DevOps / SRE',
        'design': 'UX/UI Design',
        'marketing': 'Marketing',
        'sales': 'Sales',
        'hr': 'Human Resources',
        'finance': 'Finance',
        'operations': 'Operations',
        'consulting': 'Consulting',
        'other': 'General'
    };
    
    return `You are an expert technical recruiter. Analyze this job application and return ONLY JSON.

JOB CONTEXT:
- Level: ${jobLevelContext[jobLevel] || jobLevel}
- Type: ${jobTypeContext[jobType] || jobType}
- Referral: ${applicationData?.referral ? 'Yes' : 'No'}
- Tailored: ${applicationData?.tailored_resume ? 'Yes' : 'No'}

JOB DESCRIPTION:
${jobDescription.substring(0, 2000)}${jobDescription.length > 2000 ? '...' : ''}

RESUME TEXT:
${resumeText.substring(0, 3000)}${resumeText.length > 3000 ? '...' : ''}

Return this exact JSON structure:
{
  "overallScore": number(0-100),
  "scoreBreakdown": {
    "keywordMatch": number,
    "experienceAlignment": number,
    "skillsRelevance": number,
    "formattingATS": number,
    "achievementsImpact": number
  },
  "verdict": {
    "rating": "STRONG CANDIDATE|COMPETITIVE|MARGINAL|WEAK MATCH",
    "summary": "string (max 200 chars)",
    "chanceOfGettingJob": "High|Medium|Low|Very Low"
  },
  "strengths": [{"area": "string", "description": "string (max 150 chars)", "impact": "string (max 100 chars)"}],
  "criticalGaps": [{"area": "string", "description": "string", "severity": "Critical|High|Medium|Low", "howToFix": "string"}],
  "sectionBySectionRecommendations": {
    "summary": "string",
    "experience": "string",
    "skills": "string",
    "education": "string",
    "projects": "string"
  },
  "atsOptimization": {
    "keywordsToAdd": ["string"],
    "keywordsToEmphasize": ["string"],
    "formattingIssues": ["string"],
    "actionVerbs": ["string"]
  },
  "tailoredAdvice": {
    "forThisJobLevel": "string",
    "forThisIndustry": "string",
    "competitivePositioning": "string"
  },
  "priorityActions": [
    {"priority": 1, "action": "string", "expectedImpact": "string"},
    {"priority": 2, "action": "string", "expectedImpact": "string"}
  ],
  "recruiterInsights": {
    "firstImpression": "string (max 150 chars)",
    "redFlags": ["string"],
    "greenFlags": ["string"],
    "timeToInterview": "string"
  }
}

RULES:
- NO MARKDOWN. NO CODE BLOCKS. Just raw JSON.
- Be concise to avoid truncation (keep descriptions under limits).
- Score realistically: most candidates 50-75, exceptional 80+.
- Use empty arrays [] for missing data, never omit fields.`;
}

/**
 * GET /smart-ats - Render Smart ATS page
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.session.userId;
        
        const appsResult = await db.query(
            `SELECT * FROM applications 
            WHERE user_id = $1 
            ORDER BY date_applied DESC;`,
            [userId]
        );
        
        res.render('smartAts', {
            user: req.session.userName,
            applications: appsResult.rows,
            error: null,
            analysis: null
        });
    } catch (error) {
        console.error('Smart ATS page error:', error);
        res.render('smartAts', {
            user: req.session.userName,
            applications: [],
            error: 'Failed to load applications',
            analysis: null
        });
    }
});

/**
 * POST /smart-ats/analyze - Analyze a job application
 */
router.post('/analyze', async (req, res) => {
    console.log('\n==================================================');
    console.log('🚀 STARTING SMART ATS ANALYSIS PIPELINE');
    console.log('==================================================');
    
    try {
        const { applicationId, jobDescription, jobLevel, jobType } = req.body;
        const userId = req.session.userId;
        
        console.log('\n[STEP 1] INCOMING REQUEST DATA:');
        console.log(`- Application ID: ${applicationId}`);
        console.log(`- User ID: ${userId}`);
        console.log(`- Job Level: ${jobLevel}`);
        console.log(`- Job Type: ${jobType}`);
        console.log(`- Job Description Length: ${jobDescription ? jobDescription.length : 0} chars`);
        
        if (!applicationId) {
            return res.status(400).json({ error: 'Application ID is required' });
        }
        
        if (!jobDescription || jobDescription.trim().length < 50) {
            return res.status(400).json({ error: 'Please provide a detailed job description (at least 50 characters)' });
        }
        
        // Fetch application details
        console.log(`\n[STEP 2] FETCHING DATABASE INFO FOR APP ID: ${applicationId}`);
        const appResult = await db.query(
            `SELECT *, job_description AS saved_job_description
                FROM applications 
                WHERE id = $1 AND user_id = $2;`,
            [applicationId, userId]
        );
        
        if (appResult.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        const application = appResult.rows[0];
        console.log('✅ DATABASE RECORD FOUND:', {
            company_name: application.company_name,
            job_title: application.job_title,
            has_resume_path: !!application.resume_path
        });
        
        const finalJobDescription = jobDescription || application.saved_job_description;
        
        if (!finalJobDescription) {
            return res.status(400).json({ error: 'No job description available. Please provide one.' });
        }
        
        if (!application.resume_path) {
            return res.status(400).json({ error: 'No resume attached to this application. Please upload a resume first.' });
        }
        
        // Extract resume text
        const resumePath = path.join(__dirname, '..', 'public', application.resume_path);
        console.log(`\n[STEP 3] EXTRACTING RESUME TEXT from: ${resumePath}`);
        
        let resumeData;
        try {
            resumeData = await extractResumeText(resumePath);
            console.log(`✅ RESUME EXTRACTION SUCCESS: ${resumeData.word_count} words, ${resumeData.char_count} chars`);
        } catch (extractError) {
            console.error('❌ RESUME EXTRACTION ERROR:', extractError);
            return res.status(500).json({ 
                error: 'Failed to extract resume text. Please ensure your resume is a valid PDF or DOCX file.' 
            });
        }
        
        // Analyze with AI (Groq or Gemini)
        console.log('\n[STEP 4] SENDING TO AI ANALYSIS...');
        const analysisResult = await analyzeWithAI({
            resumeText: resumeData.text,
            jobDescription: finalJobDescription,
            jobLevel: jobLevel || application.job_level || 'mid',
            jobType: jobType || 'software_engineering',
            applicationData: {
                app_method: application.app_method,
                referral: application.referral,
                tailored_resume: application.tailored_resume
            }
        });
        
        // Check if AI returned valid JSON
        if (analysisResult.parseError) {
            console.error('❌ AI RESPONSE PARSING FAILED');
            return res.status(500).json({ 
                error: 'AI analysis returned invalid format. Please try again.',
                details: analysisResult.error
            });
        }
        
        console.log('✅ AI ANALYSIS COMPLETE! Overall Score:', analysisResult.overallScore);
        
        // Save to database
        console.log('\n[STEP 5] SAVING RESULTS TO DATABASE...');
        await db.query(
            `INSERT INTO smart_ats_analyses 
             (user_id, application_id, overall_score, analysis_data, created_at) 
             VALUES ($1, $2, $3, $4, NOW())`,
            [userId, applicationId, analysisResult.overallScore || 0, JSON.stringify(analysisResult)]
        );
        console.log('✅ DATABASE INSERT SUCCESS');
        
        // Send response
        res.json({
            success: true,
            analysis: analysisResult,
            application: {
                id: application.id,
                company_name: application.company_name,
                job_title: application.job_title,
                job_level: jobLevel || application.job_level || 'mid'
            },
            resumeStats: {
                wordCount: resumeData.word_count,
                charCount: resumeData.char_count
            }
        });
        
        console.log('==================================================');
        console.log('🏁 SMART ATS ANALYSIS COMPLETE');
        console.log('==================================================\n');
        
    } catch (error) {
        console.error('\n❌ CRITICAL ROUTE ERROR:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to analyze application. Please try again.' 
        });
    }
});

/**
 * GET /smart-ats/history - Get analysis history
 */
router.get('/history', async (req, res) => {
    try {
        const userId = req.session.userId;
        
        const historyResult = await db.query(
            `SELECT s.*, a.job_title, a.company_name
            FROM smart_ats_analyses s
            JOIN applications a ON s.application_id = a.id
            WHERE s.user_id = $1
            ORDER BY s.created_at DESC
            LIMIT 20;`,
            [userId]
        );
        
        res.json({
            success: true,
            history: historyResult.rows
        });
        
    } catch (error) {
        console.error('Smart ATS history error:', error);
        res.status(500).json({ error: 'Failed to fetch analysis history' });
    }
});

/**
 * GET /smart-ats/analysis/:id - Get specific analysis
 */
router.get('/analysis/:id', async (req, res) => {
    try {
        const userId = req.session.userId;
        const analysisId = req.params.id;
        
        const result = await db.query(
            `SELECT s.*, a.job_title, a.company_name
            FROM smart_ats_analyses s
            JOIN applications a ON s.application_id = a.id
            WHERE s.id = $1 AND s.user_id = $2;`,
            [analysisId, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Analysis not found' });
        }
        
        const analysis = result.rows[0];
        analysis.analysis_data = JSON.parse(analysis.analysis_data);
        
        res.json({
            success: true,
            analysis: analysis
        });
        
    } catch (error) {
        console.error('Get analysis error:', error);
        res.status(500).json({ error: 'Failed to fetch analysis' });
    }
});

module.exports = router;