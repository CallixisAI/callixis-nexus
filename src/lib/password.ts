// Client-feedback plan §A / A.1 — the single source of truth for the minimum password length.
// Before this it was declared inline in Activate.tsx (`MIN_PASSWORD_LENGTH = 8`) and, separately,
// hardcoded as `minLength={6}` in ResetPassword.tsx — two password forms silently disagreeing
// about the rule. Both now import from here.
export const MIN_PASSWORD_LENGTH = 8;
