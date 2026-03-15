// routes/ats.js - Windows Compatible Version with correct path
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Configure multer for CV uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'ats');
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
        const fileType = path.extname(req.file.originalname).toLowerCase().replace('.', '');

        const result = await runPythonAnalyzerWindows(cvPath, jobDescription, fileType);
        
        // Clean up file after analysis
        try {
            fs.unlinkSync(cvPath);
        } catch (e) {
            console.log('Failed to clean up CV file:', e);
        }

        if (result.error) {
            return res.render('ats-analyzer', {
                user: req.session.userName,
                result: null,
                error: result.error
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

// Windows-compatible Python runner with CORRECT PATH
function runPythonAnalyzerWindows(cvPath, jobDescription, fileType) {
    return new Promise((resolve, reject) => {
        // FIXED: Point to analytics-service subdirectory
        const pythonScript = path.join(__dirname, '..', 'analytics-service', 'ats_analyzer.py');
        
        console.log('[ATS] Looking for Python script at:', pythonScript);
        
        // Verify script exists
        if (!fs.existsSync(pythonScript)) {
            return resolve({ 
                error: `ATS analyzer script not found at: ${pythonScript}\n` +
                       `Expected location: analytics-service/ats_analyzer.py`
            });
        }

        const pythonCommands = [
            process.env.PYTHON_PATH,
            'py',
            'python',
            'python3',
            'C:\\Python311\\python.exe',
            'C:\\Python310\\python.exe',
            'C:\\Users\\22033\\AppData\\Local\\Programs\\Python\\Python311\\python.exe',
            'C:\\Users\\22033\\AppData\\Local\\Programs\\Python\\Python310\\python.exe'
        ].filter(Boolean);

        const escapedJD = jobDescription
            .replace(/"/g, '\\"')
            .replace(/\r/g, ' ')
            .replace(/\n/g, ' ');

        tryNextCommand(0);

        function tryNextCommand(index) {
            if (index >= pythonCommands.length) {
                return resolve({ 
                    error: `Python not found. Tried: ${pythonCommands.join(', ')}\n\n` +
                           `Please either:\n` +
                           `1. Install Python from python.org\n` +
                           `2. Add Python to your PATH\n` +
                           `3. Set PYTHON_PATH environment variable\n` +
                           `4. Disable Microsoft Store Python alias in Settings`
                });
            }

            const cmd = pythonCommands[index];
            console.log(`[ATS] Trying Python: ${cmd}`);

            const pythonProcess = spawn(cmd, [
                pythonScript,
                cvPath,
                escapedJD,
                fileType
            ], {
                timeout: 30000,
                windowsHide: true,
                shell: false
            });

            let output = '';
            let errorOutput = '';
            let hasReceivedData = false;

            pythonProcess.stdout.on('data', (data) => {
                hasReceivedData = true;
                output += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                console.log(`[ATS] stderr: ${data.toString()}`);
            });

            pythonProcess.on('error', (err) => {
                console.log(`[ATS] ${cmd} failed to spawn:`, err.code);
                if (err.code === 'ENOENT') {
                    tryNextCommand(index + 1);
                } else {
                    resolve({ error: `Python error: ${err.message}` });
                }
            });

            pythonProcess.on('close', (code) => {
                console.log(`[ATS] ${cmd} exited with code ${code}`);
                
                if (!hasReceivedData || code !== 0) {
                    if (index < pythonCommands.length - 1) {
                        tryNextCommand(index + 1);
                    } else {
                        resolve({ error: `Python analysis failed: ${errorOutput || 'No output'}` });
                    }
                    return;
                }

                try {
                    const jsonMatch = output.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const result = JSON.parse(jsonMatch[0]);
                        resolve(result);
                    } else {
                        resolve({ error: 'Invalid response from analysis engine (no JSON found)' });
                    }
                } catch (parseErr) {
                    resolve({ error: 'Failed to parse analysis results' });
                }
            });
        }
    });
}

module.exports = router; 