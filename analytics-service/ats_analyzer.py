# ats_analyzer.py - Standalone ATS analysis service
import sys
import json
import re
from typing import Dict, List, Tuple, Any
from dataclasses import dataclass
import math

# Try to import PDF extraction libraries
try:
    import pdfplumber
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False
    print("Warning: pdfplumber not installed. PDF extraction disabled.")

try:
    from docx import Document
    DOCX_SUPPORT = True
except ImportError:
    DOCX_SUPPORT = False
    print("Warning: python-docx not installed. DOCX extraction disabled.")

@dataclass
class MatchResult:
    keyword: str
    found_in_cv: bool
    found_in_jd: bool
    context: str
    importance: str  # 'critical', 'important', 'nice_to_have'
    category: str    # 'skills', 'experience', 'education', 'tools', 'soft_skills'

class ATSAnalyzer:
    def __init__(self):
        self.common_stopwords = {
            'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
            'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
            'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
        }
        
        # Technical skills taxonomy for better matching
        self.skill_categories = {
            'programming_languages': [
                'python', 'javascript', 'java', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin',
                'go', 'rust', 'typescript', 'scala', 'perl', 'r', 'matlab', 'vba', 'sql',
                'html', 'css', 'sass', 'less', 'bash', 'powershell', 'shell', 'lua'
            ],
            'frameworks_libraries': [
                'react', 'angular', 'vue', 'django', 'flask', 'spring', 'laravel', 'rails',
                'express', 'next.js', 'nuxt', 'svelte', 'jquery', 'bootstrap', 'tailwind',
                'tensorflow', 'pytorch', 'keras', 'scikit-learn', 'pandas', 'numpy', 'matplotlib',
                'node.js', 'npm', 'webpack', 'babel', 'gulp', 'grunt', 'docker', 'kubernetes'
            ],
            'databases': [
                'mysql', 'postgresql', 'mongodb', 'sqlite', 'oracle', 'redis', 'elasticsearch',
                'cassandra', 'dynamodb', 'firebase', 'supabase', 'snowflake', 'bigquery'
            ],
            'cloud_platforms': [
                'aws', 'azure', 'gcp', 'google cloud', 'heroku', 'vercel', 'netlify', 'digitalocean',
                'linode', 'cloudflare', 'terraform', 'ansible', 'jenkins', 'github actions', 'gitlab ci'
            ],
            'methodologies': [
                'agile', 'scrum', 'kanban', 'waterfall', 'devops', 'ci/cd', 'tdd', 'bdd',
                'oop', 'functional programming', 'microservices', 'rest api', 'graphql', 'soap'
            ],
            'tools_soft': [
                'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'trello', 'asana',
                'slack', 'teams', 'zoom', 'figma', 'sketch', 'adobe xd', 'photoshop', 'illustrator'
            ],
            'soft_skills': [
                'leadership', 'communication', 'teamwork', 'collaboration', 'problem solving',
                'critical thinking', 'time management', 'adaptability', 'creativity', 'empathy',
                'negotiation', 'presentation', 'mentoring', 'coaching', 'conflict resolution'
            ],
            'business_domains': [
                'saas', 'fintech', 'healthcare', 'e-commerce', 'retail', 'manufacturing',
                'logistics', 'marketing', 'sales', 'hr', 'accounting', 'legal', 'education'
            ]
        }
        
        # Flatten all skills for quick lookup
        self.all_skills = set()
        for category in self.skill_categories.values():
            self.all_skills.update(category)
    
    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """Extract text from PDF file"""
        if not PDF_SUPPORT:
            raise ImportError("pdfplumber not installed. Run: pip install pdfplumber")
        
        text = ""
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
        except Exception as e:
            raise Exception(f"PDF extraction failed: {str(e)}")
        
        return self.clean_text(text)
    
    def extract_text_from_docx(self, docx_path: str) -> str:
        """Extract text from DOCX file"""
        if not DOCX_SUPPORT:
            raise ImportError("python-docx not installed. Run: pip install python-docx")
        
        try:
            doc = Document(docx_path)
            text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
            return self.clean_text(text)
        except Exception as e:
            raise Exception(f"DOCX extraction failed: {str(e)}")
    
    def clean_text(self, text: str) -> str:
        """Clean and normalize text"""
        # Convert to lowercase
        text = text.lower()
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        # Remove special characters but keep alphanumeric, spaces, and common punctuation
        text = re.sub(r'[^\w\s\-\+\.#]', ' ', text)
        return text.strip()
    
    def extract_keywords(self, text: str, min_length: int = 2) -> Dict[str, Any]:
        """Extract keywords and phrases from text"""
        words = text.split()
        
        # Extract n-grams (1-3 words)
        unigrams = [w for w in words if len(w) >= min_length and w not in self.common_stopwords]
        bigrams = [' '.join(words[i:i+2]) for i in range(len(words)-1)]
        trigrams = [' '.join(words[i:i+3]) for i in range(len(words)-2)]
        
        # Count frequencies
        from collections import Counter
        unigram_freq = Counter(unigrams)
        bigram_freq = Counter(bigrams)
        trigram_freq = Counter(trigrams)
        
        return {
            'unigrams': dict(unigram_freq),
            'bigrams': dict(bigram_freq),
            'trigrams': dict(trigram_freq),
            'all_terms': set(unigrams + bigrams + trigrams)
        }
    
    def categorize_skill(self, term: str) -> Tuple[str, str]:
        """Categorize a skill and determine importance"""
        term_lower = term.lower()
        
        for category, skills in self.skill_categories.items():
            if any(skill in term_lower or term_lower in skill for skill in skills):
                # Determine importance based on category
                if category in ['programming_languages', 'frameworks_libraries', 'databases']:
                    return 'technical', 'critical'
                elif category in ['cloud_platforms', 'methodologies']:
                    return 'technical', 'important'
                elif category == 'soft_skills':
                    return 'soft_skill', 'important'
                else:
                    return 'domain', 'nice_to_have'
        
        # Check if it looks like a technical term (contains numbers or special chars)
        if any(c.isdigit() for c in term) or any(c in term for c in ['+', '#', '.', '-']):
            return 'technical', 'important'
        
        return 'general', 'nice_to_have'
    
    def calculate_semantic_similarity(self, cv_text: str, jd_text: str) -> float:
        """Calculate semantic similarity using simple word overlap and TF-IDF-like scoring"""
        cv_keywords = self.extract_keywords(cv_text)
        jd_keywords = self.extract_keywords(jd_text)
        
        # Calculate overlap
        cv_terms = cv_keywords['all_terms']
        jd_terms = jd_keywords['all_terms']
        
        if not jd_terms:
            return 0.0
        
        intersection = cv_terms.intersection(jd_terms)
        jd_only = jd_terms - cv_terms
        
        # Weighted score: critical terms worth more
        score = 0
        total_weight = 0
        
        for term in jd_terms:
            category, importance = self.categorize_skill(term)
            weight = 3.0 if importance == 'critical' else 2.0 if importance == 'important' else 1.0
            total_weight += weight
            
            if term in intersection:
                score += weight
        
        return (score / total_weight * 100) if total_weight > 0 else 0
    
    def find_missing_critical_skills(self, cv_text: str, jd_text: str) -> List[Dict]:
        """Find critical skills in JD that are missing from CV"""
        jd_keywords = self.extract_keywords(jd_text)
        cv_text_lower = cv_text.lower()
        
        missing = []
        
        for term in jd_keywords['all_terms']:
            category, importance = self.categorize_skill(term)
            
            if importance == 'critical' and term not in cv_text_lower:
                # Check for partial matches
                partial_match = any(word in cv_text_lower for word in term.split())
                
                if not partial_match:
                    missing.append({
                        'skill': term,
                        'category': category,
                        'importance': importance,
                        'suggestion': f"Add '{term}' to your skills or experience section"
                    })
        
        # Sort by importance
        return sorted(missing, key=lambda x: x['importance'], reverse=True)[:10]
    
    def find_matching_strengths(self, cv_text: str, jd_text: str) -> List[Dict]:
        """Find strong matches between CV and JD"""
        cv_keywords = self.extract_keywords(cv_text)
        jd_keywords = self.extract_keywords(jd_text)
        
        matches = []
        intersection = cv_keywords['all_terms'].intersection(jd_keywords['all_terms'])
        
        for term in intersection:
            category, importance = self.categorize_skill(term)
            
            # Calculate frequency score
            cv_freq = cv_keywords['unigrams'].get(term, 0) + cv_keywords['bigrams'].get(term, 0)
            jd_freq = jd_keywords['unigrams'].get(term, 0) + jd_keywords['bigrams'].get(term, 0)
            
            if importance in ['critical', 'important'] or cv_freq > 1:
                matches.append({
                    'skill': term,
                    'category': category,
                    'importance': importance,
                    'cv_mentions': cv_freq,
                    'jd_mentions': jd_freq,
                    'context': self.extract_context(cv_text, term)
                })
        
        # Sort by importance then by frequency
        importance_order = {'critical': 0, 'important': 1, 'nice_to_have': 2}
        matches.sort(key=lambda x: (importance_order.get(x['importance'], 3), -x['cv_mentions']))
        
        return matches[:15]
    
    def extract_context(self, text: str, term: str, window: int = 50) -> str:
        """Extract context around a term"""
        term_lower = term.lower()
        text_lower = text.lower()
        
        idx = text_lower.find(term_lower)
        if idx == -1:
            return ""
        
        start = max(0, idx - window)
        end = min(len(text), idx + len(term) + window)
        
        context = text[start:end].strip()
        # Highlight the term
        term_in_context = text[idx:idx+len(term)]
        context = context.replace(term_in_context, f"**{term_in_context}**", 1)
        
        return context
    
    def calculate_experience_match(self, cv_text: str, jd_text: str) -> Dict:
        """Analyze experience requirements vs CV experience"""
        # Extract years of experience mentioned
        jd_years_pattern = r'(\d+)\+?\s*years?(?:\s*of)?\s*(?:experience|exp)'
        cv_years_pattern = r'(\d+)\+?\s*years?(?:\s*of)?\s*(?:experience|exp)'
        
        jd_years = re.findall(jd_years_pattern, jd_text.lower())
        cv_years = re.findall(cv_years_pattern, cv_text.lower())
        
        jd_required = max([int(y) for y in jd_years]) if jd_years else 0
        cv_has = max([int(y) for y in cv_years]) if cv_years else 0
        
        if jd_required == 0:
            match_score = 100  # No specific requirement
            verdict = "No specific years requirement stated"
        elif cv_has >= jd_required:
            match_score = 100
            verdict = f"✓ Meets requirement ({cv_has}+ years vs {jd_required}+ required)"
        elif cv_has >= jd_required * 0.8:
            match_score = 80
            verdict = f"~ Close match ({cv_has}+ years vs {jd_required}+ required) - emphasize transferable skills"
        else:
            match_score = max(0, (cv_has / jd_required) * 100) if jd_required > 0 else 0
            verdict = f"✗ Gap identified ({cv_has}+ years vs {jd_required}+ required) - focus on quality over quantity"
        
        return {
            'score': round(match_score, 1),
            'required_years': jd_required,
            'your_years': cv_has,
            'verdict': verdict,
            'recommendation': "Add specific years of experience to your summary" if cv_has == 0 else ""
        }
    
    def check_formatting_issues(self, cv_text: str) -> List[Dict]:
        """Check for common ATS-unfriendly formatting issues"""
        issues = []
        original_text = cv_text  # Keep original for case-sensitive checks
        
        # Check for tables (simplified - look for aligned patterns)
        if re.search(r'\|\s*[\w\s]+\s*\|', original_text):
            issues.append({
                'type': 'table_detected',
                'severity': 'high',
                'issue': 'Tables detected in CV',
                'impact': 'Many ATS systems cannot parse tables properly',
                'fix': 'Convert tables to simple bullet points or plain text sections'
            })
        
        # Check for images/graphic elements (markers in text)
        if '[image]' in original_text.lower() or 'graphic' in original_text.lower():
            issues.append({
                'type': 'graphics',
                'severity': 'medium',
                'issue': 'Graphics or images may be present',
                'impact': 'ATS cannot read text embedded in images',
                'fix': 'Ensure all text is actual text, not images of text'
            })
        
        # Check for special characters that might confuse ATS
        special_chars = re.findall(r'[^\w\s\-\+\.#\@]', original_text)
        if len(special_chars) > 20:
            issues.append({
                'type': 'special_characters',
                'severity': 'low',
                'issue': 'Excessive special characters detected',
                'impact': 'May cause parsing errors in some ATS systems',
                'fix': 'Simplify formatting, use standard characters only'
            })
        
        # Check contact info format
        email_pattern = r'[\w\.-]+@[\w\.-]+\.\w+'
        phone_pattern = r'[\+\(]?[1-9][0-9 .\-\(\)]{8,}[0-9]'
        
        if not re.search(email_pattern, original_text):
            issues.append({
                'type': 'missing_email',
                'severity': 'critical',
                'issue': 'No email address detected',
                'impact': 'Recruiters cannot contact you',
                'fix': 'Add a clear professional email address'
            })
        
        if not re.search(phone_pattern, original_text):
            issues.append({
                'type': 'missing_phone',
                'severity': 'high',
                'issue': 'No phone number detected',
                'impact': 'May be filtered out for lacking contact info',
                'fix': 'Add a professional phone number with country code'
            })
        
        # Check section headers
        standard_sections = ['experience', 'education', 'skills', 'summary', 'objective', 'projects']
        found_sections = [s for s in standard_sections if s in original_text.lower()]
        
        if len(found_sections) < 3:
            issues.append({
                'type': 'missing_sections',
                'severity': 'high',
                'issue': f'Only {len(found_sections)} standard sections found',
                'impact': 'ATS may struggle to categorize your information',
                'fix': f'Add clear headers for: {", ".join([s for s in standard_sections if s not in [f.lower() for f in found_sections]])}'
            })
        
        # Check for keyword stuffing
        words = cv_text.split()
        word_freq = {}
        for word in words:
            if len(word) > 3:
                word_freq[word] = word_freq.get(word, 0) + 1
        
        stuffed = [w for w, c in word_freq.items() if c > 10 and w not in self.common_stopwords]
        if stuffed:
            issues.append({
                'type': 'keyword_stuffing',
                'severity': 'medium',
                'issue': f'Potential keyword stuffing detected: {", ".join(stuffed[:3])}',
                'impact': 'May be flagged as spam by ATS',
                'fix': 'Use keywords naturally in context, don\'t repeat excessively'
            })
        
        return issues
    
    def generate_brutal_feedback(self, score: float, matches: List[Dict], missing: List[Dict], 
                                experience: Dict, formatting: List[Dict]) -> Dict:
        """Generate brutally honest feedback"""
        
        feedback = {
            'overall_verdict': '',
            'strengths_summary': [],
            'weaknesses_summary': [],
            'action_items': [],
            'honest_assessment': ''
        }
        
        # Overall verdict
        if score >= 85:
            feedback['overall_verdict'] = 'STRONG CANDIDATE - This CV should pass most ATS filters'
            feedback['honest_assessment'] = 'Your CV is well-optimized. Minor tweaks could make it exceptional.'
        elif score >= 70:
            feedback['overall_verdict'] = 'COMPETITIVE - Good match but room for improvement'
            feedback['honest_assessment'] = 'You meet core requirements but may lose to better-optimized candidates.'
        elif score >= 50:
            feedback['overall_verdict'] = 'MARGINAL - Significant gaps detected, needs work'
            feedback['honest_assessment'] = 'You might get filtered out. Major revisions recommended before applying.'
        else:
            feedback['overall_verdict'] = 'WEAK MATCH - High risk of ATS rejection'
            feedback['honest_assessment'] = 'This CV is unlikely to pass automated screening. Complete overhaul needed.'
        
        # Strengths
        critical_matches = [m for m in matches if m['importance'] == 'critical']
        if critical_matches:
            feedback['strengths_summary'].append(
                f"Strong on critical skills: {', '.join([m['skill'] for m in critical_matches[:3]])}"
            )
        
        if experience['score'] >= 80:
            feedback['strengths_summary'].append(f"Experience level matches requirements ({experience['your_years']}+ years)")
        
        # Weaknesses
        critical_missing = [m for m in missing if m['importance'] == 'critical']
        if critical_missing:
            feedback['weaknesses_summary'].append(
                f"Missing {len(critical_missing)} critical skills including: {', '.join([m['skill'] for m in critical_missing[:3]])}"
            )
        
        high_severity_formatting = [f for f in formatting if f['severity'] in ['critical', 'high']]
        if high_severity_formatting:
            feedback['weaknesses_summary'].append(
                f"{len(high_severity_formatting)} formatting issues that block ATS parsing"
            )
        
        # Action items prioritized
        if critical_missing:
            feedback['action_items'].append({
                'priority': 'URGENT',
                'action': f"Add these critical skills if you have them: {', '.join([m['skill'] for m in critical_missing[:5]])}"
            })
        
        if experience['score'] < 80 and experience['required_years'] > 0:
            feedback['action_items'].append({
                'priority': 'HIGH',
                'action': experience['recommendation'] or "Clarify years of experience in your summary"
            })
        
        for issue in high_severity_formatting[:2]:
            feedback['action_items'].append({
                'priority': 'HIGH',
                'action': f"Fix: {issue['fix']}"
            })
        
        if score < 70:
            feedback['action_items'].append({
                'priority': 'MEDIUM',
                'action': 'Add more quantifiable achievements (metrics, percentages, dollar amounts)'
            })
        
        return feedback
    
    def analyze(self, cv_path: str, job_description: str, file_type: str = 'pdf') -> Dict:
        """Main analysis function"""
        
        # Extract text based on file type
        if file_type == 'pdf':
            cv_text = self.extract_text_from_pdf(cv_path)
        elif file_type in ['docx', 'doc']:
            cv_text = self.extract_text_from_docx(cv_path)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")
        
        # Clean job description
        jd_text = self.clean_text(job_description)
        
        # Run all analyses
        semantic_score = self.calculate_semantic_similarity(cv_text, jd_text)
        matching_skills = self.find_matching_strengths(cv_text, jd_text)
        missing_skills = self.find_missing_critical_skills(cv_text, jd_text)
        experience_analysis = self.calculate_experience_match(cv_text, jd_text)
        formatting_issues = self.check_formatting_issues(cv_text)
        
        # Calculate final weighted score
        weights = {
            'semantic': 0.4,
            'experience': 0.25,
            'formatting': 0.2,
            'critical_skills': 0.15
        }
        
        # Adjust semantic score based on missing critical skills
        critical_missing_count = len([m for m in missing_skills if m['importance'] == 'critical'])
        skill_penalty = min(20, critical_missing_count * 5)  # Max 20 point penalty
        
        final_score = (
            (semantic_score * weights['semantic']) +
            (experience_analysis['score'] * weights['experience']) +
            ((100 - len(formatting_issues) * 5) * weights['formatting']) +
            (max(0, 100 - skill_penalty) * weights['critical_skills'])
        )
        
        final_score = max(0, min(100, final_score))
        
        # Generate feedback
        feedback = self.generate_brutal_feedback(
            final_score, matching_skills, missing_skills, 
            experience_analysis, formatting_issues
        )
        
        return {
            'ats_score': round(final_score, 1),
            'breakdown': {
                'keyword_match': round(semantic_score, 1),
                'experience_match': experience_analysis,
                'formatting_score': max(0, 100 - len(formatting_issues) * 5),
                'critical_skills_coverage': max(0, 100 - skill_penalty)
            },
            'matching_strengths': matching_skills,
            'missing_critical': missing_skills,
            'formatting_issues': formatting_issues,
            'feedback': feedback,
            'raw_cv_length': len(cv_text),
            'raw_jd_length': len(jd_text)
        }


def main():
    """CLI interface for testing"""
    if len(sys.argv) < 3:
        print("Usage: python ats_analyzer.py <cv_path> <job_description_text_or_file>")
        sys.exit(1)
    
    cv_path = sys.argv[1]
    jd_input = sys.argv[2]
    
    # Check if JD is a file or text
    if os.path.isfile(jd_input):
        with open(jd_input, 'r', encoding='utf-8') as f:
            job_description = f.read()
    else:
        job_description = jd_input
    
    # Determine file type
    file_type = cv_path.split('.')[-1].lower()
    
    analyzer = ATSAnalyzer()
    result = analyzer.analyze(cv_path, job_description, file_type)
    
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    import os
    main()