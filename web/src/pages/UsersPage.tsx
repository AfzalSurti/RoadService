import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { User } from "../types";

export function UsersPage() {
  const { token, isReadonly } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    role: "contractor",
    password: "",
    phone: "",
  });

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

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || isReadonly) return;
    setError(null);
    try {
      await api.createUser(token, form);
      setForm({ email: "", full_name: "", role: "contractor", password: "", phone: "" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {!isReadonly ? (
        <section className="panel">
          <h2>Create user</h2>
          <form className="form-grid" onSubmit={onCreate}>
            <label>
              Full name
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            <label>
              Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="admin">Admin</option>
                <option value="government">Government</option>
                <option value="contractor">Contractor</option>
                <option value="surveyor">Surveyor</option>
              </select>
            </label>
            <label>
              Password
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
              />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
