import { useEffect, useState } from "react";
import { Plus, Save } from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import type { User } from "../types";
import { FieldLabel, FormMessage, inputClass, selectClass } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";
import { StatusBadge } from "../components/resrva/StatusBadge";

export default function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [statusEdits, setStatusEdits] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const loadUsers = async () => {
    const payload = await apiFetch<{ items: User[] }>("users");
    setUsers(payload.items);
  };

  useEffect(() => {
    loadUsers().catch((err) => {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Users failed to load." });
    });
  }, []);

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await apiFetch<{ ok: boolean }>("users", {
      method: "POST",
      ...toJsonBody(form),
    });
    setForm({ name: "", email: "", password: "" });
    setMessage({ type: "success", text: "Manager account created." });
    await loadUsers();
  };

  const saveUser = async (user: User) => {
    await apiFetch<{ ok: boolean }>(`users/${user.id}`, {
      method: "PUT",
      ...toJsonBody({ status: statusEdits[user.id] || user.status }),
    });
    setMessage({ type: "success", text: `${user.name} updated.` });
    await loadUsers();
  };

  if (!users) {
    return <LoadingState label="Loading users" />;
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Manager accounts for role-based dashboard access."
      />

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form onSubmit={createUser} className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <h2 className="text-lg font-semibold text-gray-900">Create manager</h2>
          <div className="mt-4 space-y-4">
            <div>
              <FieldLabel htmlFor="user-name">Name</FieldLabel>
              <input id="user-name" className={inputClass} required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div>
              <FieldLabel htmlFor="user-email">Email</FieldLabel>
              <input id="user-email" type="email" className={inputClass} required value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            </div>
            <div>
              <FieldLabel htmlFor="user-password">Temporary password</FieldLabel>
              <input id="user-password" type="password" className={inputClass} required minLength={8} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
            </div>
            {message ? <FormMessage type={message.type}>{message.text}</FormMessage> : null}
            <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
              <Plus className="size-4" />
              Create user
            </button>
          </div>
        </form>

        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-3 py-3 font-medium text-gray-900">{user.name}</td>
                    <td className="px-3 py-3 text-gray-600">{user.email}</td>
                    <td className="px-3 py-3 capitalize text-gray-600">{user.role}</td>
                    <td className="px-3 py-3">
                      <div className="mb-2">
                        <StatusBadge status={user.status} />
                      </div>
                      <select className={selectClass} value={statusEdits[user.id] || user.status} onChange={(event) => setStatusEdits((current) => ({ ...current, [user.id]: event.target.value }))}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => saveUser(user)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700">
                        <Save className="size-3.5" />
                        Save
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
