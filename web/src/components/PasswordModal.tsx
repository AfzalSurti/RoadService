import { FormEvent, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

/** Same rule as the server: 8+ characters, a letter and a number, no spaces at either end. */
export function passwordChecks(pw: string) {
  return [
    { ok: pw.length >= 8, label: "At least 8 characters" },
    { ok: /[A-Za-z]/.test(pw), label: "At least one letter" },
    { ok: /\d/.test(pw), label: "At least one number" },
    { ok: pw === pw.trim(), label: "No space at the start or end" },
  ];
}

function generatePassword() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "@#$%&*!";
  const rand = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [rand(letters.slice(0, 24)), rand(letters.slice(24)), rand(digits), rand(digits), rand(symbols)];
  while (chars.length < 12) chars.push(rand(letters + digits));
  return chars.sort(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 - 0.5).join("");
}

type Props =
  | { mode: "self"; onClose: () => void }
  | { mode: "reset"; userId: number; userLabel: string; onClose: () => void };

/**
 * Change my password (current + new + confirm) or, for GMC Experts, reset another user's password
 * (new + confirm, with a "Generate" option). Rules are shown as a live checklist.
 */
export function PasswordModal(props: Props) {
  const { token } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const checks = passwordChecks(next);
  const sameAsCurrent = props.mode === "self" && next.length > 0 && next === current;
  const matches = confirm.length > 0 && confirm === next;
  const valid = checks.every((c) => c.ok) && matches && !sameAsCurrent && (props.mode === "reset" || current.length > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !valid) return;
    setBusy(true);
    setError(null);
    try {
      if (props.mode === "self") await api.changePassword(token, current, next);
      else await api.updateUser(token, props.userId, { password: next });
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the password");
    } finally {
      setBusy(false);
    }
  };

  const type = show ? "text" : "password";
  return (
    <div className="drawer-backdrop modal-center" onClick={props.onClose}>
      <form className="pw-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{props.mode === "self" ? "Change password" : "Reset password"}</h2>
        {props.mode === "reset" ? <p className="muted">For {props.userLabel}</p> : null}

        {done ? (
          <>
            <div className="ok">
              {props.mode === "self"
                ? "Your password has been changed. Use the new password the next time you sign in."
                : "Password reset. Share the new password with the user privately (not in a group chat); they can change it from Account → Change password."}
            </div>
            {props.mode === "reset" ? (
              <div className="pw-reveal">
                <code>{next}</code>
                <button type="button" className="btn ghost" onClick={() => void navigator.clipboard?.writeText(next)}>
                  Copy
                </button>
              </div>
            ) : null}
            <div className="btn-row">
              <button type="button" className="btn" onClick={props.onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            {error ? <div className="error">{error}</div> : null}
            {props.mode === "self" ? (
              <label>
                Current password
                <input type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
              </label>
            ) : null}
            <label>
              New password
              <span className="pw-row">
                <input type={type} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} autoFocus={props.mode === "reset"} />
                {props.mode === "reset" ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      const pw = generatePassword();
                      setNext(pw);
                      setConfirm(pw);
                      setShow(true);
                    }}
                  >
                    Generate
                  </button>
                ) : null}
              </span>
            </label>
            <ul className="pw-checks">
              {checks.map((c) => (
                <li key={c.label} className={c.ok ? "ok-rule" : undefined}>
                  {c.ok ? "✓" : "•"} {c.label}
                </li>
              ))}
              {props.mode === "self" ? (
                <li className={next && !sameAsCurrent ? "ok-rule" : undefined}>
                  {next && !sameAsCurrent ? "✓" : "•"} Different from the current password
                </li>
              ) : null}
            </ul>
            <label>
              Confirm new password
              <input type={type} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              {confirm && !matches ? <span className="field-error">The two passwords do not match</span> : null}
            </label>
            <label className="check">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
            </label>
            <div className="btn-row">
              <button type="submit" className="btn" disabled={!valid || busy}>
                {busy ? "Saving…" : props.mode === "self" ? "Change password" : "Reset password"}
              </button>
              <button type="button" className="btn ghost" onClick={props.onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
