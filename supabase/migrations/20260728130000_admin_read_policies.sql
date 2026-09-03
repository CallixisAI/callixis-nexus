-- Issue 5: /admin queries profiles and user_roles directly, but both tables only had
-- own-row SELECT policies — so an admin's query returned just their own row, not every
-- user. These policies are additive (RLS policies OR together); the existing own-row
-- policies are untouched and keep working for non-admins.

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
