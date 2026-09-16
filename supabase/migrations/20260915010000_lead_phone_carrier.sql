-- lead-enrichment plan — phone_carrier, found 2026-09-15 in the real file's actual header row
-- (EMAIL, first_name, last_name, address, city, zip, phone, phone_type, phone_country,
-- phone_region, phone_carrier, gender, dob, married, edu_level, credit_score, home_type,
-- home_built_year, stories, bedrooms, bathrooms, "Last service_required", ip, datepost) but never
-- named in the original plan's D-1/D-2/D-3 decisions or the first lead-enrichment migration
-- (20260915000000_lead_enrichment.sql, already applied live). Same "store it, never speak it"
-- bucket as phone_type/phone_region (D-4) — a mobile carrier name is not sensitive and not
-- regulated, unlike D-3's excluded fields (dob/married/edu_level/credit_score/ip).
--
-- Nullable, no default — same reasoning as every other column in the first migration.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_carrier TEXT;

COMMENT ON COLUMN public.leads.phone_carrier IS
  'lead-enrichment plan — stored for filtering only, never spoken on a call. Found in the real '
  'file''s header row (phone_carrier) after the first migration had already shipped without it.';
