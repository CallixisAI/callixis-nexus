-- Insert the user's specific scanner key
INSERT INTO public.scanner_keys (key, label)
VALUES ('tbs_48397c7dc57b7d5c0827581807145df344ba2475225f8491', 'User Browser Scanner')
ON CONFLICT (key) DO NOTHING;
