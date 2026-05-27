import { useEffect, useState } from "react";
import { Camera, LockKeyhole, Save, Trash2, Upload, UserRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiFetch, apiUpload, toJsonBody } from "../lib/api";
import type { User } from "../types";
import { FieldLabel, FormMessage, inputClass } from "../components/resrva/FormField";
import { PageHeader } from "../components/resrva/PageHeader";

type ProfileForm = {
  name: string;
  email: string;
  password: string;
  confirm_password: string;
};

const emptyProfileForm: ProfileForm = {
  name: "",
  email: "",
  password: "",
  confirm_password: "",
};

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState<ProfileForm>(emptyProfileForm);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;

    setForm({
      name: user.name,
      email: user.email,
      password: "",
      confirm_password: "",
    });
  }, [user]);

  const updateForm = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const userInitials =
    user?.name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "M";

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);
    setMessage(null);
    setUploadingAvatar(true);

    try {
      await apiUpload<{ url: string; user: User }>("profile/avatar", formData);
      await refresh();
      setMessage({ type: "success", text: "Profile image updated." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Profile image could not be uploaded." });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    setMessage(null);
    setUploadingAvatar(true);

    try {
      await apiFetch<{ ok: boolean; user: User }>("profile/avatar", { method: "DELETE" });
      await refresh();
      setMessage({ type: "success", text: "Profile image removed." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Profile image could not be removed." });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (form.password && form.password !== form.confirm_password) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    setSaving(true);
    try {
      await apiFetch<{ user: User }>("profile", {
        method: "PUT",
        ...toJsonBody({
          name: form.name,
          email: form.email,
          password: form.password,
        }),
      });
      await refresh();
      setForm((current) => ({ ...current, password: "", confirm_password: "" }));
      setMessage({ type: "success", text: "Profile updated." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Profile could not be updated." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Edit profile" />

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-2xl font-semibold text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  userInitials
                )}
              </div>
              <span className="absolute bottom-1 right-1 flex size-8 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-theme-sm dark:border-gray-900">
                <Camera className="size-4" />
              </span>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white/90">{user?.name || "Manager"}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{user?.role || "manager"}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <label
                htmlFor="profile-avatar"
                aria-disabled={uploadingAvatar}
                className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/5 ${
                  uploadingAvatar ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <Upload className="size-4" />
                {user?.avatar_url ? "Replace image" : "Upload image"}
              </label>
              <input
                id="profile-avatar"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={uploadingAvatar}
                onChange={uploadAvatar}
              />
              {user?.avatar_url ? (
                <button
                  type="button"
                  disabled={uploadingAvatar}
                  onClick={removeAvatar}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  <Trash2 className="size-4" />
                  Remove
                </button>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              JPG, PNG, WebP or GIF up to 5 MB.
            </p>
          </div>
        </section>

        <form onSubmit={saveProfile} className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <h2 className="text-base font-medium text-gray-800 dark:text-white/90">Profile details</h2>
          </div>

          <div className="space-y-5 p-5">
            {message ? <FormMessage type={message.type}>{message.text}</FormMessage> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="profile-name">Name</FieldLabel>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                  <input
                    id="profile-name"
                    className={`${inputClass} pl-10`}
                    required
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <FieldLabel htmlFor="profile-email">Email</FieldLabel>
                <input
                  id="profile-email"
                  type="email"
                  className={inputClass}
                  required
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                />
              </div>

              <div>
                <FieldLabel htmlFor="profile-password">New password</FieldLabel>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                  <input
                    id="profile-password"
                    type="password"
                    minLength={8}
                    className={`${inputClass} pl-10`}
                    value={form.password}
                    onChange={(event) => updateForm("password", event.target.value)}
                  />
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="profile-confirm-password">Confirm password</FieldLabel>
                <input
                  id="profile-confirm-password"
                  type="password"
                  minLength={8}
                  className={inputClass}
                  value={form.confirm_password}
                  onChange={(event) => updateForm("confirm_password", event.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-700 disabled:opacity-60"
              >
                <Save className="size-4" />
                {saving ? "Saving" : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
