-- Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
    name TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add RLS policies for accounts table
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to read accounts
CREATE POLICY "Allow anonymous users to read accounts" ON accounts
    FOR SELECT
    USING (true);

-- Allow anonymous users to insert accounts
CREATE POLICY "Allow anonymous users to insert accounts" ON accounts
    FOR INSERT
    WITH CHECK (true);

-- Allow anonymous users to update accounts
CREATE POLICY "Allow anonymous users to update accounts" ON accounts
    FOR UPDATE
    USING (true);

-- Allow anonymous users to delete accounts
CREATE POLICY "Allow anonymous users to delete accounts" ON accounts
    FOR DELETE
    USING (true); 