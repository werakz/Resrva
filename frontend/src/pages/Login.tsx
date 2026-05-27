import { useState } from "react";
import { ArrowLeft, LogIn } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { FieldLabel, FormMessage, inputClass } from "../components/resrva/FormField";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("manager@resrva.test");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/app" replace />;
  }

  const submitLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await login(email, password);
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7f2] px-4 py-8">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          <ArrowLeft className="size-4" />
          Public booking
        </Link>

        <form onSubmit={submitLogin} className="rounded-lg border border-gray-200 bg-white p-6 shadow-theme-lg">
          <div className="mb-6">
            <img src="/images/logo/resrva-mark.svg" alt="Resrva" className="mb-4 size-12 rounded-lg" />
            <h1 className="text-2xl font-semibold text-gray-950">Manager sign in</h1>
            <p className="mt-1 text-sm text-gray-500">
              Access bookings, functions, tables, users, and settings.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <input
                id="email"
                type="email"
                className={inputClass}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <input
                id="password"
                type="password"
                className={inputClass}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error ? <FormMessage type="error">{error}</FormMessage> : null}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-700 disabled:opacity-60"
            >
              <LogIn className="size-4" />
              {submitting ? "Signing in" : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
