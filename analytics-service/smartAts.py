#!/usr/bin/env python3
"""
Smart ATS - Resume Text Extraction Service
Extracts text from PDF and DOCX resumes for Smart ATS analysis
"""

import sys
import json
import os
import re

# Try to import PDF extraction libraries
try:
    import pdfplumber
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False
    print(json.dumps({"error": "pdfplumber not installed. Run: pip install pdfplumber"}))

try:
    from docx import Document
    DOCX_SUPPORT = True
except ImportError:
    DOCX_SUPPORT = False


def clean_text(text: str) -> str:
    """Clean and normalize extracted text"""
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text)
    # Remove special characters but keep common ones
    text = re.sub(r'[^\w\s\-\+\.\#\@\(\)\,\/\:\;]', ' ', text)
    return text.strip()


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF file"""
    if not PDF_SUPPORT:
        raise ImportError("pdfplumber not installed")
    
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")
    
    text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        raise Exception(f"PDF extraction failed: {str(e)}")
    
    return clean_text(text)


def extract_text_from_docx(docx_path: str) -> str:
    """Extract text from DOCX file"""
    if not DOCX_SUPPORT:
        raise ImportError("python-docx not installed")
    
    if not os.path.exists(docx_path):
        raise FileNotFoundError(f"DOCX file not found: {docx_path}")
    
    try:
        doc = Document(docx_path)
        text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        return clean_text(text)
    except Exception as e:
        raise Exception(f"DOCX extraction failed: {str(e)}")


def extract_resume_text(file_path: str) -> dict:
    """Main function to extract resume text from various formats"""
    if not os.path.exists(file_path):
        return {"error": f"File not found: {file_path}"}
    
    # Determine file type from extension
    file_ext = os.path.splitext(file_path)[1].lower()
    
    try:
        if file_ext == '.pdf':
            text = extract_text_from_pdf(file_path)
        elif file_ext in ['.docx', '.doc']:
            text = extract_text_from_docx(file_path)
        else:
            return {"error": f"Unsupported file type: {file_ext}. Only PDF and DOCX are supported."}
        
        # Get basic stats
        word_count = len(text.split())
        char_count = len(text)
        
        return {
            "success": True,
            "text": text,
            "word_count": word_count,
            "char_count": char_count,
            "file_type": file_ext.replace('.', '')
        }
        
    except Exception as e:
        return {"error": str(e)}


def main():
    """CLI interface"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python smartAts.py <resume_path>"}))
        sys.exit(1)
    
    resume_path = sys.argv[1]
    result = extract_resume_text(resume_path)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
