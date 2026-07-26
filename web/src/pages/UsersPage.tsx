import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { PasswordInput } from "../components/PasswordInput";
import * as v from "../lib/validation";
import type { User } from "../types";

const emptyForm = {
  email: "",
  full_name: "",
  role: "contractor",
  password: "",
  phone: "",
};

export function UsersPage() {
  const { token, isReadonly } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<v.FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const load = () => {
    if (!token) return;
    api
      .users(token)
      .then(setUsers)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Users";
  }, []);

  useEffect(() => {
    load();
  }, [token]);

  const validate = (next = form) => {
    const errors = v.collect({
      full_name: v.fullName(next.full_name),
      email: v.email(next.email),
      password: v.password(next.password, { min: 8 }),
      phone: v.phone(next.phone, true),
      role: ["admin", "government", "contractor", "surveyor"].includes(next.role)
        ? null
        : "Select a valid role",
    });
    setFieldErrors(errors);
    return errors;
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || isReadonly) return;
    setTouched({
      full_name: true,
      email: true,
      password: true,
      phone: true,
      role: true,
    });
    const errors = validate();
    if (Object.keys(errors).length) {
      setError(v.firstError(errors));
      return;
    }
    setError(null);
    try {
      await api.createUser(token, {
        ...form,
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || undefined,
      });
      setForm(emptyForm);
      setTouched({});
      setFieldErrors({});
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const setField = (key: keyof typeof emptyForm, value: string) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (touched[key]) validate(next);
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {!isReadonly ? (
        <section className="panel">
          <h2>Create user</h2>
          <form className="form-grid" onSubmit={onCreate} noValidate>
            <label>
              Full name
              <input
                value={form.full_name}
                aria-invalid={Boolean(touched.full_name && fieldErrors.full_name)}
                onChange={(e) => setField("full_name", e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, full_name: true }));
                  validate();
                }}
              />
              {touched.full_name && fieldErrors.full_name ? (
                <span className="field-error">{fieldErrors.full_name}</span>
              ) : null}
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                autoComplete="off"
                aria-invalid={Boolean(touched.email && fieldErrors.email)}
                onChange={(e) => setField("email", e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, email: true }));
                  validate();
                }}
              />
              {touched.email && fieldErrors.email ? (
                <span className="field-error">{fieldErrors.email}</span>
              ) : null}
            </label>
            <label>
              Role
              <select
                value={form.role}
                onChange={(e) => setField("role", e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, role: true }))}
              >
                <option value="admin">Admin</option>
                <option value="government">Government</option>
                <option value="contractor">Contractor</option>
                <option value="surveyor">Surveyor</option>
              </select>
            </label>
            <label>
              Password
              <PasswordInput
                value={form.password}
                autoComplete="new-password"
                aria-invalid={Boolean(touched.password && fieldErrors.password)}
                onChange={(value) => setField("password", value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, password: true }));
                  validate();
                }}
              />
              {touched.password && fieldErrors.password ? (
                <span className="field-error">{fieldErrors.password}</span>
              ) : (
                <span className="field-hint">At least 8 characters</span>
              )}
            </label>
            <label>
              Phone
              <input
                value={form.phone}
                inputMode="tel"
                aria-invalid={Boolean(touched.phone && fieldErrors.phone)}
                onChange={(e) => setField("phone", e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, phone: true }));
                  validate();
                }}
              />
              {touched.phone && fieldErrors.phone ? (
                <span className="field-error">{fieldErrors.phone}</span>
              ) : null}
            </label>
            <button className="btn" type="submit">
              Create
            </button>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.is_active ? "Yes" : "No"}</td>
                <td>
                  {!isReadonly ? (
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={async () => {
                        if (!token) return;
                        await api.updateUser(token, u.id, { is_active: !u.is_active });
                        load();
                      }}
                    >
                      {u.is_active ? "Deactivate" : "Activate"}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
