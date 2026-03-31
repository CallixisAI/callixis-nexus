-- Create user_plugins table to store activation status and configurations
CREATE TABLE IF NOT EXISTS public.user_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plugin_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, plugin_id)
);

-- Enable RLS
ALTER TABLE public.user_plugins ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own plugins" ON public.user_plugins 
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own plugins" ON public.user_plugins 
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own plugins" ON public.user_plugins 
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own plugins" ON public.user_plugins 
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.user_plugins
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
