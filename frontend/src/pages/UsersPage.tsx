import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Search, X } from "lucide-react";
import { apiFetch, toJsonBody } from "../lib/api";
import type { User } from "../types";
import { FieldLabel, FormMessage, inputClass, selectClass } from "../components/resrva/FormField";
import { LoadingState } from "../components/resrva/LoadingState";
import { PageHeader } from "../components/resrva/PageHeader";
import { StatusBadge } from "../components/resrva/StatusBadge";

export default function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
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

  const filteredUsers = useMemo(() => {
    const needle = search.toLowerCase();
    return (users || []).filter((user) =>
      [user.name, user.email, user.role, user.status].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [search, users]);

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await apiFetch<{ ok: boolean }>("users", {
      method: "POST",
      ...toJsonBody(form),
    });
    setForm({ name: "", email: "", password: "" });
    setIsCreateOpen(false);
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

  if (!users && message?.type === "error") {
    return <FormMessage type="error">{message.text}</FormMessage>;
  }

  if (!users) {
    return <LoadingState label="Loading users" />;
  }

  return (
    <>
      <PageHeader
        title="Users"
        action={
          <button type="button" onClick={() => setIsCreateOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-700">
            <Plus className="size-4" />
            Create user
          </button>
        }
      />

      {isCreateOpen ? (
        <div className="fixed inset-0 z-999999 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
          <div className="w-full max-w-xl rounded-lg border border-gray-200 bg-white shadow-theme-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
              <h2 id="create-user-title" className="text-lg font-semibold text-gray-900">Create manager</h2>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="flex size-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50" aria-label="Close create user modal">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={createUser} className="space-y-4 p-5">
              <div>
                <FieldLabel htmlFor="user-name">Name</FieldLabel>
                <input id="user-name" className={inputClass} required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="user-email">Email</FieldLabel>
                <input id="user-email" type="email" className={inputClass} required value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="user-password">Password</FieldLabel>
                <input id="user-password" type="password" className={inputClass} required minLength={8} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
                  <Plus className="size-4" />
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-theme-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input className={`${inputClass} pl-10`} placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>

        {message ? <div className="mt-4"><FormMessage type={message.type}>{message.text}</FormMessage></div> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Updated</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((user) => (
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
                  <td className="px-3 py-3 text-gray-500">{user.updated_at || user.created_at}</td>
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
      </section>
    </>
  );
}
