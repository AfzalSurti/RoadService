export type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s()-]{7,20}$/;

export function required(value: string, label = "This field"): string | null {
  if (!value.trim()) return `${label} is required`;
  return null;
}

export function email(value: string): string | null {
  const miss = required(value, "Email");
  if (miss) return miss;
  if (!EMAIL_RE.test(value.trim())) return "Enter a valid email address";
  return null;
}

export function password(value: string, { min = 8, required: must = true } = {}): string | null {
  if (!value) return must ? "Password is required" : null;
  if (value.length < min) return `Password must be at least ${min} characters`;
  return null;
}

export function fullName(value: string): string | null {
  const miss = required(value, "Full name");
  if (miss) return miss;
  if (value.trim().length < 2) return "Name must be at least 2 characters";
  return null;
}

export function phone(value: string, optional = true): string | null {
  if (!value.trim()) return optional ? null : "Phone is required";
  if (!PHONE_RE.test(value.trim())) return "Enter a valid phone number";
  return null;
}

export function minLength(value: string, min: number, label = "This field"): string | null {
  const miss = required(value, label);
  if (miss) return miss;
  if (value.trim().length < min) return `${label} must be at least ${min} characters`;
  return null;
}

export function integerInRange(value: string, min: number, max: number, label = "Value"): string | null {
  const miss = required(value, label);
  if (miss) return miss;
  if (!/^\d+$/.test(value.trim())) return `${label} must be a whole number`;
  const n = Number(value);
  if (n < min || n > max) return `${label} must be between ${min} and ${max}`;
  return null;
}

export function firstError(errors: FieldErrors): string | null {
  const values = Object.values(errors).filter(Boolean);
  return values[0] ?? null;
}

export function collect(checks: Record<string, string | null | undefined>): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, msg] of Object.entries(checks)) {
    if (msg) out[key] = msg;
  }
  return out;
}
