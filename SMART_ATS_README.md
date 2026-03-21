# Smart ATS Feature Documentation

## Overview

Smart ATS is an AI-powered resume analysis feature that acts like a senior recruiter with 20+ years of experience. It evaluates your job application by comparing your resume against the job description and provides:

- **Overall Score** (0-100) - Your chances of getting the job
- **Detailed Breakdown** - Keyword match, experience alignment, skills relevance, ATS formatting, and achievements impact
- **Strengths & Gaps** - What you're doing right and what needs improvement
- **Section-by-Section Recommendations** - Specific advice for each part of your resume
- **ATS Optimization Tips** - Keywords to add and emphasize
- **Priority Actions** - Most important changes to make first
- **Recruiter Insights** - First impression analysis and red/green flags

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Dashboard UI  │───▶│  Node.js Routes  │────▶│  Gemini AI API  │
│  (smartAts.ejs) │     │  (smartAts.js)   │     │  (Google AI)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │ Python Extractor │
                        │  (smartAts.py)   │
                        └──────────────────┘
```

## Setup Instructions

### 1. Environment Variables

Add the following to your `.env` file:

```env
# Gemini API Key (Required for Smart ATS)
GEMINI_API_KEY=your_gemini_api_key_here

# Get your API key from: https://aistudio.google.com/app/apikey
```

### 2. Database Migration

Run the SQL migration to create the `smart_ats_analyses` table:

```bash
# Using psql
psql -d your_database_name -f smart_ats_migration.sql

# Or run the SQL directly in your database client
```

### 3. Install Python Dependencies

Ensure you have the required Python packages:

```bash
pip install pdfplumber python-docx
```

### 4. File Placement

Copy the following files to your project:

```
/views/
  └── smartAts.ejs          # Smart ATS dashboard UI
/routes/
  └── smartAts.js           # Smart ATS API routes
/smartAts.py                # Resume text extraction (project root)
/smart_ats_migration.sql    # Database migration
```

### 5. Update index.js

The routes are already registered in the updated `index.js`:

```javascript
app.use('/smart-ats', checkAuth, require('./routes/smartAts'));
```

## Usage

1. **Navigate to Smart ATS** from the sidebar menu
2. **Select an application** from your tracked jobs
3. **Choose job level** (Entry, Mid, Senior, Lead, Executive)
4. **Select job type/industry**
5. **Paste the job description**
6. **Click "Analyze My Chances"**
7. **Review the AI-powered feedback**

## API Endpoints

### POST /smart-ats/analyze
Analyze a job application

**Request Body:**
```json
{
  "applicationId": 123,
  "jobLevel": "senior",
  "jobType": "software_engineering",
  "jobDescription": "Full job description text..."
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "overallScore": 72,
    "scoreBreakdown": {
      "keywordMatch": 75,
      "experienceAlignment": 80,
      "skillsRelevance": 70,
      "formattingATS": 85,
      "achievementsImpact": 60
    },
    "verdict": {
      "rating": "COMPETITIVE",
      "summary": "Good match with room for improvement",
      "chanceOfGettingJob": "Medium"
    },
    "strengths": [...],
    "criticalGaps": [...],
    "sectionBySectionRecommendations": {...},
    "atsOptimization": {...},
    "priorityActions": [...],
    "tailoredAdvice": {...},
    "recruiterInsights": {...}
  }
}
```

### GET /smart-ats/history
Get analysis history for the logged-in user

### GET /smart-ats/analysis/:id
Get a specific analysis by ID

## Score Interpretation

| Score | Rating | Interpretation |
|-------|--------|----------------|
| 80-100 | STRONG CANDIDATE | Your resume should pass most ATS filters |
| 65-79 | COMPETITIVE | Good match but room for improvement |
| 50-64 | MARGINAL | Significant gaps detected, needs work |
| 0-49 | WEAK MATCH | High risk of ATS rejection |

## Customization

### Modifying the AI Prompt

Edit the `buildSmartATSPrompt` function in `routes/smartAts.js` to customize:
- The recruiter persona
- Analysis criteria
- Output format
- Scoring weights

### Adding New Job Types

Add new job types to the `jobTypeContext` object in `buildSmartATSPrompt`:

```javascript
const jobTypeContext = {
  'your_new_type': 'Description of new job type',
  // ... existing types
};
```

## Troubleshooting

### "Gemini API key not configured"
- Make sure `GEMINI_API_KEY` is set in your `.env` file
- Restart your server after adding the key

### "Resume extraction failed"
- Ensure `pdfplumber` and `python-docx` are installed
- Check that the resume file exists in the uploads folder
- Verify the resume is a valid PDF or DOCX file

### "Analysis failed"
- Check your Gemini API key is valid
- Ensure you have internet connectivity
- Verify the job description is at least 50 characters

## Cost Considerations

The Smart ATS feature uses Google's Gemini API. Be aware of:
- **Free Tier**: 1,500 requests/day (as of 2024)
- **Pricing**: Check current rates at https://ai.google.dev/pricing
- **Token Usage**: Longer job descriptions use more tokens

## Security Notes

- Resume text is processed in-memory and not permanently stored
- Analysis results are saved to your database for history
- API keys should never be committed to version control
- Consider rate limiting the `/analyze` endpoint for production use
