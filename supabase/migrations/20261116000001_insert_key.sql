-- Insert the initial scanner key
INSERT INTO public.scanner_keys (key, label)
VALUES ('tbs_a7e6a039dfba6d862966f3a111e12f7eea93b32ea5182bc7', 'Default Browser Scanner')
ON CONFLICT (key) DO NOTHING;
