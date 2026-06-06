import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  function validate() {
    const next: { name?: string; email?: string; password?: string } = {};
    if (!name.trim()) next.name = "Name is required.";
    if (!email.trim()) next.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Enter a valid email.";
    if (!password) next.password = "Password is required.";
    else if (password.length < 8) next.password = "Password must be at least 8 characters.";
    return next;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        setFormError(
          res.status === 409
            ? "An account with this email already exists."
            : "Something went wrong. Please try again."
        );
        return;
      }

      const data = await res.json();
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/");
    } catch {
      setFormError("Couldn't reach the server. Is it running?");
    } finally {
      setSubmitting(false);
    }
  }

  const inputBase =
    "w-full rounded-lg border bg-canvas px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink/40 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22" height="22" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              className="text-accent"
            >
              <path d="M12 7v14" />
              <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-ink-strong">Create your account</h1>
            <p className="text-sm text-ink mt-1">Start studying smarter with StudyBrite</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-line bg-onyx-900 p-6 shadow-2xl shadow-black/40">
          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm text-ink">Name</label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="Jane Doe"
                value={name}
                disabled={submitting}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
                }}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "name-error" : undefined}
                className={`${inputBase} ${
                  errors.name ? "border-red-500/60 focus:border-red-500" : "border-line focus:border-accent"
                }`}
              />
              {errors.name && <p id="name-error" className="text-xs text-red-400">{errors.name}</p>}
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm text-ink">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                disabled={submitting}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                }}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                className={`${inputBase} ${
                  errors.email ? "border-red-500/60 focus:border-red-500" : "border-line focus:border-accent"
                }`}
              />
              {errors.email && <p id="email-error" className="text-xs text-red-400">{errors.email}</p>}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm text-ink">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  disabled={submitting}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                  }}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "password-error" : "password-hint"}
                  className={`${inputBase} pr-10 ${
                    errors.password ? "border-red-500/60 focus:border-red-500" : "border-line focus:border-accent"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink hover:text-ink-strong transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                      <path d="m2 2 20 20" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password ? (
                <p id="password-error" className="text-xs text-red-400">{errors.password}</p>
              ) : (
                <p id="password-hint" className="text-xs text-ink/70">Must be at least 8 characters.</p>
              )}
            </div>

            {formError && (
              <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {formError}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-onyx-50 hover:bg-bitter-chocolate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-onyx-900 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-ink mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-ink-strong hover:text-accent transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
