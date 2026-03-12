from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import os
import sys
import traceback

try:
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("Warning: scikit-learn not installed. ML features disabled.")

app = FastAPI(title="Optimus AI Analytics Engine")

# CORS for Node.js communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # More permissive for debugging
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# DATA MODELS
# ============================================================================

class ApplicationData(BaseModel):
    id: int
    company_name: str
    job_title: str
    status: str
    date_applied: str
    last_contact_date: Optional[str] = None
    app_method: str
    job_level: str
    experience_level: int
    your_experience_years: int
    job_domain: List[str]
    required_skills: List[str]
    tailored_resume: bool
    referral: bool
    assessment_upfront: bool
    assessment_type: Optional[str] = None
    time_spent_minutes: int
    industry: Optional[str] = None
    work_arrangement: str
    salary: Optional[str] = None
    company_size: Optional[str] = None

class AnalyticsRequest(BaseModel):
    user_id: int
    applications: List[ApplicationData]

class PredictionRequest(BaseModel):
    company_name: str
    job_title: str
    job_level: str
    experience_required: int
    your_experience: int
    app_method: str
    industry: Optional[str] = None
    company_size: Optional[str] = None
    tailored_resume: bool = False
    referral: bool = False
    assessment_upfront: bool = False

# ============================================================================
# AI ANALYTICS ENGINE (SIMPLIFIED - NO DATABASE CONNECTION NEEDED)
# ============================================================================

@app.post("/api/analyze")
async def analyze_applications(data: AnalyticsRequest):
    """
    Comprehensive AI-driven analysis of job application data
    Node.js sends the data, we analyze it - no direct DB connection needed
    """
    try:
        print(f"Received {len(data.applications)} applications for analysis")
        
        if len(data.applications) == 0:
            return {
                "executive_summary": {
                    "pipeline_health_score": 0,
                    "total_applications": 0,
                    "active_applications": 0,
                    "offers_received": 0,
                    "interview_rate": 0,
                    "ai_diagnosis": "No applications found. Start tracking your job search!",
                    "conversion_funnel": {"applied_to_screen": 0, "screen_to_interview": 0, "interview_to_offer": 0}
                },
                "channel_performance": [],
                "actionable_recommendations": [{
                    "priority": "HIGH",
                    "category": "Getting Started",
                    "issue": "No application data available",
                    "action": "Add your first job application to begin AI analysis",
                    "expected_impact": "Personalized insights",
                    "timeframe": "Now"
                }]
            }
        
        df_data = []
        for app in data.applications:
            df_data.append({
                'id': app.id,
                'company_name': app.company_name,
                'job_title': app.job_title,
                'status': app.status,
                'date_applied': pd.to_datetime(app.date_applied),
                'last_contact_date': pd.to_datetime(app.last_contact_date) if app.last_contact_date else None,
                'app_method': app.app_method,
                'job_level': app.job_level,
                'experience_level': app.experience_level,
                'your_experience_years': app.your_experience_years,
                'job_domain': app.job_domain,
                'required_skills': app.required_skills,
                'tailored_resume': app.tailored_resume,
                'referral': app.referral,
                'assessment_upfront': app.assessment_upfront,
                'time_spent_minutes': app.time_spent_minutes,
                'industry': app.industry,
                'work_arrangement': app.work_arrangement
            })
        
        df = pd.DataFrame(df_data)
        
        analysis = {
            "executive_summary": generate_executive_summary(df),
            "channel_performance": analyze_channels(df),
            "predictive_models": build_predictive_models(df),
            "behavioral_insights": analyze_behavioral_patterns(df),
            "actionable_recommendations": generate_recommendations(df),
            "risk_alerts": identify_risks(df),
            "success_archetypes": find_success_patterns(df),
            "skill_gap_analysis": analyze_skill_gaps(df)
        }
        
        print("Analysis complete")
        return analysis
        
    except Exception as e:
        print(f"ERROR in analyze: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

def generate_executive_summary(df: pd.DataFrame) -> Dict:
    """Generate high-level strategic overview"""
    total = len(df)
    offers = len(df[df['status'] == 'offer received'])
    interviews = len(df[df['status'].isin(['interview', 'final interview', 'phone screen'])])
    active = len(df[~df['status'].isin(['offer received', 'rejected', 'ghosted', 'withdrawn'])])
    
    screened = len(df[df['status'].isin(['shortlisted', 'interview', 'phone screen', 'final interview', 'offer received'])])
    applied_to_screen = round((screened / total) * 100, 1) if total > 0 else 0
    
    interview_stages = len(df[df['status'].isin(['interview', 'final interview', 'offer_received'])])
    shortlisted_count = len(df[df['status'] == 'shortlisted'])
    screen_to_interview = round((interview_stages / max(shortlisted_count, 1)) * 100, 1)
    
    interview_count = len(df[df['status'].isin(['interview', 'final interview'])])
    interview_to_offer = round((offers / max(interview_count, 1)) * 100, 1)
    
    health_score = calculate_health_score(df)
    
    return {
        "pipeline_health_score": round(health_score, 1),
        "total_applications": total,
        "active_applications": active,
        "offers_received": offers,
        "interview_rate": round((interviews / max(total, 1)) * 100, 1),
        "conversion_funnel": {
            "applied_to_screen": applied_to_screen,
            "screen_to_interview": screen_to_interview,
            "interview_to_offer": interview_to_offer
        },
        "ai_diagnosis": generate_diagnosis(df, health_score)
    }

def calculate_health_score(df: pd.DataFrame) -> float:
    """AI-calculated pipeline health score 0-100"""
    if len(df) == 0:
        return 0
    
    scores = []
    
    # Offer rate (30% weight)
    offer_rate = len(df[df['status'] == 'offer received']) / len(df) * 100
    scores.append(min(offer_rate * 3, 30))
    
    # Response rate (25% weight)
    responded = len(df[df['status'] != 'applied'])
    scores.append(min(responded / len(df) * 25, 25))
    
    # Diversity of channels (15% weight)
    unique_channels = df['app_method'].nunique()
    scores.append(min(unique_channels * 3, 15))
    
    # Tailored resume usage (15% weight)
    tailored_rate = df['tailored_resume'].mean() * 15
    scores.append(tailored_rate)
    
    # Strategic targeting (15% weight)
    experience_fit = (df['your_experience_years'] >= df['experience_level'] * 0.7).mean() * 15
    scores.append(experience_fit)
    
    return sum(scores)

def generate_diagnosis(df: pd.DataFrame, health_score: float) -> str:
    """AI-generated strategic diagnosis"""
    if len(df) < 5:
        return "INSUFFICIENT_DATA: Apply to more positions (5+) to generate meaningful insights."
    
    issues = []
    
    if health_score < 40:
        issues.append("Critical: Your application strategy needs significant adjustment")
    elif health_score < 60:
        issues.append("Warning: Moderate inefficiencies detected in approach")
    
    if len(df) > 10 and df['tailored_resume'].mean() < 0.3:
        issues.append("You're using generic resumes. Tailoring increases success by 3-5x.")
    
    top_channel_pct = df['app_method'].value_counts().iloc[0] / len(df)
    if top_channel_pct > 0.7:
        issues.append(f"Over-reliance on {df['app_method'].value_counts().index[0]}. Diversify channels.")
    
    ghosted = len(df[df['status'] == 'ghosted'])
    closed = len(df[df['status'].isin(['ghosted', 'rejected', 'offer received'])])
    if closed > 0 and ghosted / closed > 0.6:
        issues.append("High ghosting rate. Focus on referrals and direct outreach.")
    
    if not issues:
        return "Your application strategy is well-optimized. Continue current approach."
    
    return " | ".join(issues)

def analyze_channels(df: pd.DataFrame) -> List[Dict]:
    """Deep analysis of application channels"""
    if len(df) == 0:
        return []
    
    channels = df.groupby('app_method').agg({
        'id': 'count',
        'status': lambda x: (x.isin(['interview', 'final interview', 'offer_received', 'shortlisted'])).sum()
    }).reset_index()
    
    channels.columns = ['channel', 'total', 'positive_outcomes']
    channels['success_rate'] = (channels['positive_outcomes'] / channels['total'] * 100).round(1)
    
    results = []
    for _, row in channels.iterrows():
        channel_data = df[df['app_method'] == row['channel']]
        
        responded = channel_data[channel_data['last_contact_date'].notna()]
        avg_days = None
        if len(responded) > 0:
            days = (responded['last_contact_date'] - responded['date_applied']).dt.days
            avg_days = round(days.mean(), 1)
        
        results.append({
            "channel": row['channel'],
            "applications": int(row['total']),
            "positive_outcomes": int(row['positive_outcomes']),
            "success_rate": float(row['success_rate']),
            "avg_time_to_response": avg_days,
            "recommendation": generate_channel_recommendation(row, row['success_rate'])
        })
    
    return sorted(results, key=lambda x: x['success_rate'], reverse=True)

def generate_channel_recommendation(row, success_rate):
    """AI recommendation per channel"""
    if row['total'] < 3:
        return "Gather more data (3+ applications) before drawing conclusions"
    
    if success_rate > 40:
        return "HIGH PERFORMER: Prioritize this channel for 60%+ of applications"
    elif success_rate > 20:
        return "ABOVE AVERAGE: Maintain current investment in this channel"
    elif success_rate > 10:
        return "UNDERPERFORMING: Review your approach for this channel"
    else:
        return "POOR FIT: Consider deprioritizing unless strategic reasons exist"

def build_predictive_models(df: pd.DataFrame) -> Dict:
    """Build lightweight ML models for success prediction"""
    if len(df) < 10:
        return {
            "status": "INSUFFICIENT_DATA",
            "message": f"Apply to {10 - len(df)} more positions to activate ML models"
        }
    
    df['success'] = df['status'].isin(['offer received', 'interview', 'final interview', 'shortlisted']).astype(int)
    
    correlations = {}
    factors = {
        'tailored_resume': 'Resume Tailoring',
        'referral': 'Employee Referral',
        'time_spent_minutes': 'Application Time',
        'your_experience_years': 'Your Experience',
        'experience_level': 'Required Experience'
    }
    
    for col, name in factors.items():
        if col in df.columns:
            corr = df[col].corr(df['success'])
            if not pd.isna(corr):
                correlations[name] = round(corr, 3)
    
    sorted_corr = sorted(correlations.items(), key=lambda x: abs(x[1]), reverse=True)
    
    interpretations = []
    for name, corr in sorted_corr[:4]:
        direction = "increases" if corr > 0 else "decreases"
        strength = "strongly" if abs(corr) > 0.3 else "moderately" if abs(corr) > 0.15 else "slightly"
        
        action = "Maintain current approach"
        if name == 'Resume Tailoring' and corr > 0:
            action = "Customize every resume for specific roles"
        elif name == 'Employee Referral' and corr > 0:
            action = "Prioritize networking and referral requests"
        elif name == 'Application Time' and corr > 0:
            action = "Invest more time in quality applications"
        
        interpretations.append({
            "factor": name,
            "impact": f"{strength} {direction} success probability",
            "correlation": corr,
            "action": action
        })
    
    return {
        "status": "ACTIVE",
        "feature_importance": sorted_corr,
        "key_predictors": interpretations,
        "success_probability_formula": build_success_formula(sorted_corr)
    }

def build_success_formula(corr_list):
    """Build a human-readable success formula"""
    if not corr_list:
        return "Insufficient data for formula"
    
    positive_factors = [name for name, val in corr_list if val > 0.2][:2]
    if not positive_factors:
        return "No strong positive factors identified yet"
    
    return f"Success ≈ {' + '.join(positive_factors)}"

def analyze_behavioral_patterns(df: pd.DataFrame) -> Dict:
    """Analyze user behavior and efficiency"""
    if len(df) < 2:
        return {"application_velocity": {"avg_days_between_applications": 0, "trend": "N/A"}}
    
    df_sorted = df.sort_values('date_applied')
    date_diffs = df_sorted['date_applied'].diff().dt.days.dropna()
    avg_days = round(date_diffs.mean(), 1)
    
    time_analysis = {
        "avg_time_per_application": round(df['time_spent_minutes'].mean(), 1),
        "time_distribution": {
            "quick (<15min)": int(len(df[df['time_spent_minutes'] < 15])),
            "standard (15-30min)": int(len(df[(df['time_spent_minutes'] >= 15) & (df['time_spent_minutes'] <= 30)])),
            "detailed (>30min)": int(len(df[df['time_spent_minutes'] > 30]))
        }
    }
    
    total_time = df['time_spent_minutes'].sum()
    positive_outcomes = len(df[df['status'].isin(['offer received', 'interview'])])
    
    return {
        "application_velocity": {
            "avg_days_between_applications": avg_days,
            "trend": "Increasing" if len(date_diffs) > 5 and date_diffs.tail(3).mean() < date_diffs.head(3).mean() else "Stable",
            "recommendation": "Apply to 3-5 positions weekly for optimal pipeline" if avg_days > 3 else "Good application rhythm"
        },
        "time_investment": time_analysis,
        "productivity_score": {
            "total_hours_invested": round(total_time / 60, 1),
            "hours_per_positive_outcome": round((total_time / 60) / max(positive_outcomes, 1), 1),
            "efficiency_rating": "High" if (total_time / 60) / max(positive_outcomes, 1) < 5 else "Medium" if (total_time / 60) / max(positive_outcomes, 1) < 10 else "Needs Optimization"
        }
    }

def generate_recommendations(df: pd.DataFrame) -> List[Dict]:
    """Generate prioritized, actionable recommendations"""
    recommendations = []
    
    ghosted = len(df[df['status'] == 'ghosted'])
    closed = len(df[df['status'].isin(['ghosted', 'rejected', 'offer received'])])
    if closed > 0 and ghosted / closed > 0.5:
        recommendations.append({
            "priority": "CRITICAL",
            "category": "Strategy",
            "issue": "High ghosting rate indicates applications aren't being seen",
            "action": "Shift 70% of efforts to referral-based applications. Use LinkedIn to find warm connections.",
            "expected_impact": "3-5x increase in response rate",
            "timeframe": "Immediate"
        })
    
    tailored_rate = df['tailored_resume'].mean()
    if tailored_rate < 0.5 and len(df) > 5:
        recommendations.append({
            "priority": "HIGH",
            "category": "Documentation",
            "issue": "Generic resumes reduce callback probability by 60%",
            "action": "Create 3 resume variants (Technical, Product, Generalist). Tailor each application.",
            "expected_impact": "2-3x increase in screening rate",
            "timeframe": "This week"
        })
    
    channel_perf = df.groupby('app_method').apply(
        lambda x: x['status'].isin(['offer received', 'interview']).mean()
    )
    if len(channel_perf) > 0:
        best_channel = channel_perf.idxmax()
        best_rate = channel_perf.max()
        if best_rate > 0.3:
            recommendations.append({
                "priority": "HIGH",
                "category": "Channel Strategy",
                "issue": f"Underutilizing high-performing channel: {best_channel}",
                "action": f"Increase {best_channel} applications to 50% of total volume",
                "expected_impact": f"{round(best_rate * 100)}% success rate vs current average",
                "timeframe": "Next 2 weeks"
            })
    
    overqualified_pct = (df['your_experience_years'] > df['experience_level'] * 1.3).mean()
    if overqualified_pct > 0.4:
        recommendations.append({
            "priority": "MEDIUM",
            "category": "Targeting",
            "issue": f"{round(overqualified_pct*100)}% of applications are for junior roles despite senior experience",
            "action": "Target Senior/Lead positions. Emphasize mentorship capability.",
            "expected_impact": "Higher salary offers, faster progression",
            "timeframe": "Ongoing"
        })
    
    stale = len(df[(df['status'] == 'applied') & 
                   (df['date_applied'] < pd.Timestamp.utcnow() - pd.Timedelta(days=14))])
    if stale > 0:
        recommendations.append({
            "priority": "MEDIUM",
            "category": "Process",
            "issue": f"{stale} applications without follow-up after 14 days",
            "action": "Schedule weekly follow-up sessions. Use template: 'Re: Application - [Role] - [Name]'",
            "expected_impact": "20-30% of ghosted applications revived",
            "timeframe": "This week"
        })
    
    return recommendations

def identify_risks(df: pd.DataFrame) -> List[Dict]:
    """Identify pipeline risks"""
    risks = []
    
    if len(df) > 0:
        top_3_pct = df['company_name'].value_counts().head(3).sum() / len(df)
        if top_3_pct > 0.5:
            risks.append({
                "type": "CONCENTRATION_RISK",
                "severity": "HIGH",
                "description": f"{round(top_3_pct*100)}% of applications to top 3 companies",
                "mitigation": "Diversify to 15+ companies to reduce dependency risk"
            })
    
    recent = len(df[df['date_applied'] > pd.Timestamp.utcnow() - pd.Timedelta(days=7)])
    if recent < 2 and len(df) > 5:
        risks.append({
            "type": "PIPELINE_STALL",
            "severity": "MEDIUM",
            "description": "No applications in last 7 days",
            "mitigation": "Maintain 3-5 weekly applications for healthy pipeline"
        })
    
    return risks

def find_success_patterns(df: pd.DataFrame) -> List[Dict]:
    """Find common characteristics of successful applications"""
    successful = df[df['status'].isin(['offer received', 'interview'])]
    if len(successful) < 2:
        return []
    
    patterns = []
    
    top_companies = successful['company_name'].value_counts().head(2)
    for company, count in top_companies.items():
        patterns.append({
            "type": "Company Pattern",
            "finding": f"{company} ({count} positive outcomes)",
            "insight": f"Strong fit with {company}'s requirements",
            "action": "Apply to similar companies in same industry"
        })
    
    top_methods = successful['app_method'].value_counts().head(2)
    for method, count in top_methods.items():
        patterns.append({
            "type": "Channel Pattern",
            "finding": f"{method} ({count} successes)",
            "insight": "Your messaging resonates through this channel",
            "action": f"Double down on {method}"
        })
    
    return patterns

def analyze_skill_gaps(df: pd.DataFrame) -> Dict:
    """Analyze skill demand"""
    all_skills = df['required_skills'].explode().value_counts().head(10)
    successful_skills = df[df['status'].isin(['offer received', 'interview'])]['required_skills'].explode().value_counts()
    
    skill_analysis = []
    for skill, total in all_skills.items():
        success_count = successful_skills.get(skill, 0)
        rate = (success_count / total * 100) if total > 0 else 0
        
        skill_analysis.append({
            "skill": skill,
            "market_demand": int(total),
            "your_success_rate": round(rate, 1),
            "strategic_value": "HIGH" if rate > 50 else "MEDIUM" if rate > 20 else "LEARNING_NEEDED"
        })
    
    return {
        "top_demanded_skills": skill_analysis[:5],
        "your_strengths": [s for s in skill_analysis if s['strategic_value'] == 'HIGH'][:3],
        "development_areas": [s for s in skill_analysis if s['strategic_value'] == 'LEARNING_NEEDED'][:3]
    }

# ============================================================================
# PREDICTION ENDPOINT
# ============================================================================

@app.post("/api/predict")
async def predict_success(request: PredictionRequest):
    """Predict success probability for a hypothetical application"""
    score = 50
    
    exp_ratio = request.your_experience / max(request.experience_required, 1)
    if 0.8 <= exp_ratio <= 1.2:
        score += 15
    elif 0.5 <= exp_ratio < 0.8:
        score -= 10
    elif exp_ratio < 0.5:
        score -= 20
    
    if request.tailored_resume:
        score += 15
    
    if request.referral:
        score += 20
    
    channel_scores = {
        'Referral': 10, 'LinkedIn': 5, 'Company Website': 5,
        'Email': 0, 'Indeed': -5, 'Recruiter': 0
    }
    score += channel_scores.get(request.app_method, 0)
    
    if request.assessment_upfront:
        score -= 5
    
    return {
        "success_probability": max(0, min(100, score)),
        "confidence": "medium",
        "key_factors": {
            "experience_fit": "optimal" if 0.8 <= exp_ratio <= 1.2 else "partial" if exp_ratio >= 0.5 else "poor",
            "tailored_resume": request.tailored_resume,
            "referral": request.referral
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)