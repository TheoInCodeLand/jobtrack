const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const path = require('path');

// Comprehensive skills database - organized by category for easy maintenance
const SKILLS_DATABASE = {
    // Programming Languages
    languages: [
        'javascript', 'python', 'java', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'go', 'rust',
        'typescript', 'scala', 'r', 'matlab', 'perl', 'shell', 'bash', 'powershell', 'sql', 'nosql',
        'groovy', 'dart', 'lua', 'haskell', 'clojure', 'erlang', 'f#', 'vb.net', 'objective-c',
        'c', 'assembly', 'fortran', 'cobol', 'delphi', 'julia', 'elixir'
    ],
    
    // Web Technologies
    web: [
        'html', 'html5', 'css', 'css3', 'react', 'react.js', 'angular', 'angularjs', 'vue', 'vue.js',
        'svelte', 'next.js', 'nuxt.js', 'node.js', 'nodejs', 'express', 'express.js',
        'django', 'flask', 'fastapi', 'spring', 'spring boot', 'laravel', 'symfony', 'rails', 'ruby on rails',
        'asp.net', 'asp.net core', 'blazor', 'jquery', 'bootstrap', 'tailwind', 'tailwind css',
        'webpack', 'vite', 'rollup', 'parcel', 'sass', 'less', 'stylus', 'postcss',
        'graphql', 'rest api', 'restful api', 'soap', 'json', 'xml', 'yaml', 'jsonp',
        'websockets', 'socket.io', 'webhooks', 'oauth', 'jwt', 'openid', 'saml',
        'pwa', 'webassembly', 'wasm', 'service workers', 'web components'
    ],
    
    // Databases
    databases: [
        'mysql', 'postgresql', 'postgres', 'mongodb', 'sqlite', 'redis', 'elasticsearch', 
        'cassandra', 'dynamodb', 'firebase', 'firestore', 'oracle', 'mssql', 'sql server',
        'couchdb', 'neo4j', 'cockroachdb', 'planetscale', 'supabase', 'faunadb',
        'prisma', 'sequelize', 'mongoose', 'typeorm', 'hibernate', 'entity framework',
        'knex', 'drizzle', 'sqlalchemy', 'jdbc', 'odbc'
    ],
    
    // Cloud & DevOps
    cloud: [
        'aws', 'amazon web services', 'azure', 'microsoft azure', 'gcp', 'google cloud platform',
        'docker', 'kubernetes', 'k8s', 'openshift', 'rancher', 'helm',
        'jenkins', 'gitlab ci', 'github actions', 'circleci', 'travis ci', 'bamboo',
        'terraform', 'pulumi', 'ansible', 'puppet', 'chef', 'saltstack',
        'vagrant', 'packer', 'consul', 'vault', 'nomad',
        'prometheus', 'grafana', 'elk stack', 'datadog', 'new relic', 'splunk',
        'nginx', 'apache', 'iis', 'tomcat', 'caddy',
        'heroku', 'vercel', 'netlify', 'railway', 'render', 'fly.io',
        'cloudflare', 'fastly', 'akamai', 'aws lambda', 'azure functions', 'gcp cloud functions'
    ],
    
    // Data Science & AI
    dataScience: [
        'machine learning', 'deep learning', 'neural networks', 'tensorflow', 'pytorch', 
        'keras', 'scikit-learn', 'sklearn', 'pandas', 'numpy', 'scipy', 'matplotlib', 
        'seaborn', 'plotly', 'bokeh', 'd3.js', 'jupyter', 'jupyter notebooks', 'rstudio',
        'opencv', 'pillow', 'nltk', 'spacy', 'huggingface', 'transformers',
        'nlp', 'natural language processing', 'computer vision', 'cv',
        'data mining', 'data warehousing', 'etl', 'elt', 'data pipeline',
        'statistics', 'a/b testing', 'hypothesis testing', 'regression', 'classification',
        'clustering', 'dimensionality reduction', 'feature engineering',
        'big data', 'hadoop', 'spark', 'apache spark', 'kafka', 'airflow', 'dbt',
        'tableau', 'power bi', 'looker', 'metabase', 'superset',
        'snowflake', 'bigquery', 'redshift', 'databricks', 'mlflow', 'kubeflow'
    ],
    
    // Mobile Development
    mobile: [
        'react native', 'flutter', 'android', 'ios', 'xamarin', 'ionic', 'cordova', 
        'phonegap', 'capacitor', 'swiftui', 'jetpack compose', 'kotlin multiplatform',
        'expo', 'fastlane', 'testflight', 'firebase cloud messaging', 'push notifications'
    ],
    
    // Tools & Methods
    tools: [
        'git', 'github', 'gitlab', 'bitbucket', 'svn', 'mercurial',
        'jira', 'confluence', 'trello', 'asana', 'monday.com', 'linear', 'notion',
        'slack', 'teams', 'discord', 'zoom', 'postman', 'insomnia', 'swagger', 'openapi',
        'figma', 'sketch', 'adobe xd', 'invision', 'zeplin', 'storybook',
        'agile', 'scrum', 'kanban', 'lean', 'xp', 'safe',
        'tdd', 'bdd', 'test driven development', 'behavior driven development',
        'ci/cd', 'cicd', 'continuous integration', 'continuous deployment',
        'devops', 'devsecops', 'gitops', 'microservices', 'soa', 'event driven architecture',
        'oop', 'object oriented programming', 'functional programming', 'procedural programming',
        'design patterns', 'solid principles', 'clean code', 'clean architecture',
        'ddd', 'domain driven design', 'tdd', 'bdd', 'ddd',
        'code review', 'pair programming', 'mob programming'
    ],
    
    // Testing
    testing: [
        'jest', 'mocha', 'chai', 'cypress', 'playwright', 'selenium', 'webdriver',
        'junit', 'testng', 'pytest', 'unittest', 'rspec', 'cucumber', 'gherkin',
        'unit testing', 'integration testing', 'e2e testing', 'end to end testing',
        'load testing', 'performance testing', 'security testing', 'penetration testing',
        'jest', 'vitest', 'testing library', 'enzyme', 'capybara'
    ],
    
    // Security
    security: [
        'cybersecurity', 'infosec', 'penetration testing', 'ethical hacking',
        'owasp', 'vulnerability assessment', 'threat modeling',
        'encryption', 'cryptography', 'ssl/tls', 'https', 'vpn',
        'firewall', 'ids', 'ips', 'siem', 'soc', 'iso 27001', 'soc 2',
        'gdpr', 'ccpa', 'hipaa', 'pci dss', 'nist', 'cobit'
    ],
    
    // Soft Skills
    softSkills: [
        'leadership', 'communication', 'teamwork', 'collaboration', 'problem solving',
        'critical thinking', 'analytical thinking', 'creative thinking',
        'project management', 'time management', 'prioritization', 'organization',
        'mentoring', 'coaching', 'conflict resolution', 'negotiation',
        'presentation skills', 'public speaking', 'technical writing', 'documentation',
        'stakeholder management', 'client management', 'vendor management',
        'agile coaching', 'scrum master', 'product owner', 'team lead', 'tech lead'
    ]
};

// Flatten all skills into a single array for easy searching
const ALL_SKILLS = Object.values(SKILLS_DATABASE).flat();

/**
 * Extract text from PDF file using PDFParse v2
 * @param {string} filePath - Path to PDF file
 * @returns {Promise<string>} Extracted text
 */
async function extractTextFromPDF(filePath) {
    try {
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const dataBuffer = fs.readFileSync(filePath);
        
        // FIX 1: Pass the buffer inside an options object to the constructor
        const parser = new PDFParse({ data: dataBuffer });
        
        // FIX 2: Call getText() without arguments
        const result = await parser.getText();
        
        // Clean up the text: normalize whitespace, remove excessive newlines
        const cleanedText = result.text
            .replace(/\r\n/g, '\n')
            .replace(/\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        return cleanedText;
    } catch (error) {
        console.error('Error extracting PDF text:', error.message);
        throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
}

/**
 * Extract skills from text using the skills database
 * @param {string} text - Text to analyze
 * @returns {string[]} Array of found skills (normalized)
 */
function extractSkillsFromText(text) {
    if (!text || typeof text !== 'string') return [];
    
    const normalizedText = text.toLowerCase();
    const foundSkills = new Set();
    
    // Sort skills by length (longest first) to prioritize multi-word matches
    const sortedSkills = [...ALL_SKILLS].sort((a, b) => b.length - a.length);
    
    for (const skill of sortedSkills) {
        // Create regex to match whole words/phrases
        // Handle special characters like +, #, . in skill names
        const escapedSkill = skill
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\s+/g, '\\s+');
        
        const regex = new RegExp(`\\b${escapedSkill}\\b`, 'i');
        
        if (regex.test(normalizedText)) {
            foundSkills.add(skill.toLowerCase());
        }
    }
    
    return Array.from(foundSkills);
}

/**
 * Compare CV skills against job required skills
 * @param {string[]} cvSkills - Skills found in CV
 * @param {string[]} requiredSkills - Skills required for job
 * @returns {Object} Analysis result with matches and gaps
 */
function analyzeSkillsGap(cvSkills, requiredSkills) {
    const normalizedCvSkills = cvSkills.map(s => s.toLowerCase().trim());
    const normalizedRequired = requiredSkills.map(s => s.toLowerCase().trim());
    
    const skillsYouHave = [];
    const skillsYouLack = [];
    
    for (const required of normalizedRequired) {
        // Check for exact match or partial match
        const hasSkill = normalizedCvSkills.some(cvSkill => {
            // Exact match
            if (cvSkill === required) return true;
            
            // Handle variations: "react" matches "react.js", "nodejs" matches "node.js"
            const normalizedCv = cvSkill.replace(/[.\s]/g, '');
            const normalizedReq = required.replace(/[.\s]/g, '');
            if (normalizedCv === normalizedReq) return true;
            
            // One contains the other (for multi-word skills)
            if (cvSkill.includes(required) || required.includes(cvSkill)) return true;
            
            return false;
        });
        
        if (hasSkill) {
            skillsYouHave.push(required);
        } else {
            skillsYouLack.push(required);
        }
    }
    
    // Calculate match percentage
    const totalRequired = normalizedRequired.length;
    const matchPercentage = totalRequired > 0 
        ? Math.round((skillsYouHave.length / totalRequired) * 100)
        : 0;
    
    return {
        skillsYouHave,
        skillsYouLack,
        matchPercentage,
        totalRequired,
        totalMatched: skillsYouHave.length
    };
}

/**
 * Main function to analyze CV against job requirements
 * @param {string} cvPath - Path to CV PDF file
 * @param {string[]} requiredSkills - Array of skills required for the job
 * @returns {Promise<Object>} Full analysis results
 */
async function analyzeCvSkills(cvPath, requiredSkills = []) {
    try {
        // Validate inputs
        if (!cvPath) {
            throw new Error('CV path is required');
        }
        
        // Extract text from CV
        const cvText = await extractTextFromPDF(cvPath);
        
        if (!cvText || cvText.length < 50) {
            throw new Error('CV appears to be empty or unreadable');
        }
        
        // Extract all skills from CV
        const cvSkills = extractSkillsFromText(cvText);
        
        // If no required skills provided, just return CV skills
        if (!requiredSkills || requiredSkills.length === 0) {
            return {
                cvSkills,
                skillsYouHave: [],
                skillsYouLack: [],
                matchPercentage: 0,
                totalRequired: 0,
                totalMatched: 0,
                cvText: cvText.substring(0, 500), // First 500 chars for preview
                cvLength: cvText.length
            };
        }
        
        // Analyze gap
        const analysis = analyzeSkillsGap(cvSkills, requiredSkills);
        
        return {
            ...analysis,
            cvSkills, // All skills found in CV
            cvText: cvText.substring(0, 500), // Preview for debugging
            cvLength: cvText.length
        };
        
    } catch (error) {
        console.error('Error in analyzeCvSkills:', error.message);
        throw error;
    }
}

/**
 * Quick skill extraction without job comparison
 * @param {string} cvPath - Path to CV PDF
 * @returns {Promise<string[]>} Array of skills found
 */
async function extractSkillsFromCV(cvPath) {
    const cvText = await extractTextFromPDF(cvPath);
    return extractSkillsFromText(cvText);
}

/**
 * Get skills by category (useful for reporting)
 * @param {string[]} skills - Array of skills to categorize
 * @returns {Object} Skills grouped by category
 */
function categorizeSkills(skills) {
    const categorized = {};
    
    for (const [category, categorySkills] of Object.entries(SKILLS_DATABASE)) {
        const matches = skills.filter(skill => 
            categorySkills.some(catSkill => 
                catSkill.toLowerCase() === skill.toLowerCase()
            )
        );
        if (matches.length > 0) {
            categorized[category] = matches;
        }
    }
    
    // Add "other" category for uncategorized skills
    const allKnownSkills = Object.values(SKILLS_DATABASE).flat().map(s => s.toLowerCase());
    const otherSkills = skills.filter(skill => !allKnownSkills.includes(skill.toLowerCase()));
    if (otherSkills.length > 0) {
        categorized.other = otherSkills;
    }
    
    return categorized;
}

/**
 * Calculate ATS score based on various factors
 * @param {Object} analysis - Result from analyzeCvSkills
 * @returns {Object} Detailed scoring breakdown
 */
function calculateATSScore(analysis) {
    const scores = {
        skillsMatch: 0,
        keywordDensity: 0,
        completeness: 0,
        overall: 0
    };
    
    // Skills match score (max 40 points)
    if (analysis.totalRequired > 0) {
        scores.skillsMatch = Math.round((analysis.matchPercentage / 100) * 40);
    } else {
        scores.skillsMatch = 20; // Neutral if no requirements specified
    }
    
    // Keyword density score (max 30 points)
    const skillDensity = analysis.cvSkills.length / (analysis.cvLength / 100);
    scores.keywordDensity = Math.min(Math.round(skillDensity * 10), 30);
    
    // Completeness score (max 30 points)
    if (analysis.cvLength > 2000) scores.completeness = 30;
    else if (analysis.cvLength > 1000) scores.completeness = 20;
    else if (analysis.cvLength > 500) scores.completeness = 10;
    else scores.completeness = 5;
    
    // Calculate overall
    scores.overall = scores.skillsMatch + scores.keywordDensity + scores.completeness;
    
    // Add recommendations
    const recommendations = [];
    if (analysis.matchPercentage < 50) {
        recommendations.push('Add more relevant skills to your CV');
    }
    if (analysis.cvLength < 1000) {
        recommendations.push('Expand your CV with more detailed experience descriptions');
    }
    if (analysis.cvSkills.length < 5) {
        recommendations.push('Include a dedicated skills section');
    }
    
    return {
        ...scores,
        recommendations,
        grade: scores.overall >= 80 ? 'A' : scores.overall >= 60 ? 'B' : scores.overall >= 40 ? 'C' : 'D'
    };
}

module.exports = {
    analyzeCvSkills,
    extractSkillsFromCV,
    extractSkillsFromText,
    extractTextFromPDF,
    categorizeSkills,
    calculateATSScore,
    SKILLS_DATABASE,
    ALL_SKILLS
};