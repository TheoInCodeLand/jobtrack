-- Smart ATS Analysis History Table
-- Run this migration to add the smart_ats_analyses table

CREATE TABLE IF NOT EXISTS smart_ats_analyses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
    analysis_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_smart_ats_user_id ON smart_ats_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_smart_ats_application_id ON smart_ats_analyses(application_id);
CREATE INDEX IF NOT EXISTS idx_smart_ats_created_at ON smart_ats_analyses(created_at DESC);

-- Optional: Add a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_smart_ats_analyses_updated_at ON smart_ats_analyses;
CREATE TRIGGER update_smart_ats_analyses_updated_at
    BEFORE UPDATE ON smart_ats_analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
