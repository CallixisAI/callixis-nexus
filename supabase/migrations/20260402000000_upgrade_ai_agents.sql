-- Upgrade ai_agents table to support advanced voice and logic settings
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS logic_provider TEXT DEFAULT 'default',
ADD COLUMN IF NOT EXISTS script TEXT DEFAULT 'Hello! My name is {{agent_name}}.',
ADD COLUMN IF NOT EXISTS voice_settings JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS vapi_assistant_id TEXT,
ADD COLUMN IF NOT EXISTS prompt_instructions TEXT,
ADD COLUMN IF NOT EXISTS welcome_message TEXT;

-- Add index for logic_provider
CREATE INDEX IF NOT EXISTS idx_ai_agents_logic_provider ON public.ai_agents(logic_provider);

-- Add comment for documentation
COMMENT ON COLUMN public.ai_agents.voice_settings IS 'Stores voice provider (elevenlabs, vapi, etc), voice_id, and stability/clarity settings.';
