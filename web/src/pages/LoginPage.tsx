import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { PasswordInput } from "../components/PasswordInput";
import * as v from "../lib/validation";

export function LoginPage() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<v.FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  if (token) return <Navigate to="/dashboard" replace />;

  const validate = (nextEmail = email, nextPassword = password) => {
    const errors = v.collect({
      email: v.email(nextEmail),
      password: v.password(nextPassword, { min: 1 }),
    });
    setFieldErrors(errors);
    return errors;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    const errors = validate();
    if (Object.keys(errors).length) {
      setError(v.firstError(errors));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <Link to="/" className="brand">
          Road<span>Service</span>
        </Link>
        <p className="muted">Web dashboard for Government, Admin, and Contractors</p>
        {error ? <div className="error">{error}</div> : null}
        <form onSubmit={onSubmit} noValidate>
          <label>
            Email
            <input
              type="email"
              value={email}
              autoComplete="username"
              aria-invalid={Boolean(touched.email && fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                if (touched.email) validate(e.target.value, password);
              }}
              onBlur={() => {
                setTouched((t) => ({ ...t, email: true }));
                validate();
              }}
            />
            {touched.email && fieldErrors.email ? (
              <span id="login-email-error" className="field-error">
                {fieldErrors.email}
              </span>
            ) : null}
          </label>
          <label>
            Password
            <PasswordInput
              value={password}
              autoComplete="current-password"
              aria-invalid={Boolean(touched.password && fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              onChange={(value) => {
                setPassword(value);
                if (touched.password) validate(email, value);
              }}
              onBlur={() => {
                setTouched((t) => ({ ...t, password: true }));
                validate();
              }}
            />
            {touched.password && fieldErrors.password ? (
              <span id="login-password-error" className="field-error">
                {fieldErrors.password}
              </span>
            ) : null}
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="login-back">
          <Link to="/">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
