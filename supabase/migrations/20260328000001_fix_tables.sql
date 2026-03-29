-- Create ai_agents table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  industry TEXT,
  model TEXT DEFAULT 'gemini-1.5-pro',
  voice TEXT DEFAULT 'nova',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid errors
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own agents" ON public.ai_agents;
  DROP POLICY IF EXISTS "Users can update own agents" ON public.ai_agents;
  DROP POLICY IF EXISTS "Users can insert own agents" ON public.ai_agents;
  DROP POLICY IF EXISTS "Users can delete own agents" ON public.ai_agents;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

CREATE POLICY "Users can view own agents" ON public.ai_agents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own agents" ON public.ai_agents FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own agents" ON public.ai_agents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own agents" ON public.ai_agents FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Alter campaigns table to add missing columns if it exists
DO $$ 
BEGIN
  ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL;
  ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS industry TEXT;
  ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS budget NUMERIC DEFAULT 0;
  ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS max_qualified_leads INTEGER DEFAULT 0;
  ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS crm_api_endpoint TEXT;
  ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS work_hours JSONB DEFAULT '{"days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "startTime": "09:00", "endTime": "17:00"}'::jsonb;
EXCEPTION WHEN undefined_table THEN
  -- Create if not exists completely
  CREATE TABLE public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'paused',
    industry TEXT,
    budget NUMERIC DEFAULT 0,
    max_qualified_leads INTEGER DEFAULT 0,
    crm_api_endpoint TEXT,
    work_hours JSONB DEFAULT '{"days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "startTime": "09:00", "endTime": "17:00"}'::jsonb,
    start_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  );
END $$;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid errors
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own campaigns" ON public.campaigns;
  DROP POLICY IF EXISTS "Users can update own campaigns" ON public.campaigns;
  DROP POLICY IF EXISTS "Users can insert own campaigns" ON public.campaigns;
  DROP POLICY IF EXISTS "Users can delete own campaigns" ON public.campaigns;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

CREATE POLICY "Users can view own campaigns" ON public.campaigns FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own campaigns" ON public.campaigns FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own campaigns" ON public.campaigns FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- Create call_records table
CREATE TABLE IF NOT EXISTS public.call_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  duration INTEGER DEFAULT 0,
  call_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  recording_url TEXT,
  is_qualified BOOLEAN DEFAULT false,
  revenue NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own call records" ON public.call_records;
  DROP POLICY IF EXISTS "Users can update own call records" ON public.call_records;
  DROP POLICY IF EXISTS "Users can insert own call records" ON public.call_records;
  DROP POLICY IF EXISTS "Users can delete own call records" ON public.call_records;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

CREATE POLICY "Users can view own call records" ON public.call_records FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own call records" ON public.call_records FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own call records" ON public.call_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own call records" ON public.call_records FOR DELETE TO authenticated USING (auth.uid() = user_id);
