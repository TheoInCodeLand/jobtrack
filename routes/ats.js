// routes/ats.js - Updated for Vercel deployment
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// Use /tmp for Vercel (only writable directory)
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : './uploads/ats';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'cv-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
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

// GET: ATS Analysis page
router.get('/', (req, res) => {
    res.render('ats-analyzer', { 
        user: req.session.userName,
        result: null,
        error: null 
    });
});

// POST: Analyze CV against job description
router.post('/analyze', upload.single('cv'), async (req, res) => {
    try {
        if (!req.file) {
            return res.render('ats-analyzer', {
                user: req.session.userName,
                result: null,
                error: 'Please upload a CV file (PDF, DOC, or DOCX)'
            });
        }

        const jobDescription = req.body.job_description;
        if (!jobDescription || jobDescription.trim().length < 50) {
            fs.unlinkSync(req.file.path);
            return res.render('ats-analyzer', {
                user: req.session.userName,
                result: null,
                error: 'Please provide a detailed job description (at least 50 characters)'
            });
        }

        const cvPath = req.file.path;
        const ext = path.extname(req.file.originalname).toLowerCase();

        // Extract text based on file type
        let cvText = '';
        try {
            if (ext === '.pdf') {
                const dataBuffer = fs.readFileSync(cvPath);
                const pdfData = await pdfParse(dataBuffer);
                cvText = pdfData.text;
            } else if (ext === '.docx' || ext === '.doc') {
                const result = await mammoth.extractRawText({ path: cvPath });
                cvText = result.value;
            } else {
                throw new Error('Unsupported file type');
            }
        } catch (extractError) {
            console.error('Text extraction error:', extractError);
            fs.unlinkSync(cvPath);
            return res.render('ats-analyzer', {
                user: req.session.userName,
                result: null,
                error: 'Failed to extract text from CV. Please try a different file.'
            });
        }

        // Clean up uploaded file
        try {
            fs.unlinkSync(cvPath);
        } catch (e) {
            console.log('Failed to clean up CV file:', e);
        }

        // Call Python ATS analyzer via HTTP
        const pythonServiceUrl = process.env.VERCEL_URL 
            ? `https://${process.env.VERCEL_URL}/ats/analyze`
            : 'http://localhost:8000/ats/analyze';

        let result;
        try {
            const response = await axios.post(pythonServiceUrl, {
                cv_text: cvText,
                job_description: jobDescription
            }, {
                timeout: 30000,
                headers: { 'Content-Type': 'application/json' }
            });
            result = response.data;
        } catch (pythonError) {
            console.error('Python service error:', pythonError.message);
            
            // Fallback: Use Node.js implementation if available
            // Or show error
            return res.render('ats-analyzer', {
                user: req.session.userName,
                result: null,
                error: 'Analysis service temporarily unavailable. Please try again later.'
            });
        }

        res.render('ats-analyzer', {
            user: req.session.userName,
            result: result,
            error: null
        });

    } catch (err) {
        console.error('ATS Analysis error:', err);
        res.render('ats-analyzer', {
            user: req.session.userName,
            result: null,
            error: 'Analysis failed: ' + err.message
        });
    }
});

module.exports = router;