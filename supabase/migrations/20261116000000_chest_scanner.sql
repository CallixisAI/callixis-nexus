-- Create a table for Scanner Keys
CREATE TABLE IF NOT EXISTS public.scanner_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id)
);

-- Create a table for Scanned Gifts
CREATE TABLE IF NOT EXISTS public.scanned_gifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_name TEXT,
    gift_name TEXT,
    amount INTEGER DEFAULT 1,
    scanned_at TIMESTAMPTZ DEFAULT now(),
    scanner_key_id UUID REFERENCES public.scanner_keys(id),
    raw_data JSONB,
    is_duplicate BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.scanner_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scanned_gifts ENABLE ROW LEVEL SECURITY;

-- Policies for Officers (assuming 'admin' or 'officer' role exists, or just authenticated for now)
CREATE POLICY "Allow authenticated users to view keys" ON public.scanner_keys
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to view gifts" ON public.scanned_gifts
    FOR SELECT TO authenticated USING (true);

-- Function to generate a new tbs_ key
CREATE OR REPLACE FUNCTION generate_scanner_key() RETURNS TEXT AS $$
DECLARE
    new_key TEXT;
BEGIN
    new_key := 'tbs_' || encode(gen_random_bytes(24), 'hex');
    RETURN new_key;
END;
$$ LANGUAGE plpgsql;
