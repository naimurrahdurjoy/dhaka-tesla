"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"PASSENGER" | "DRIVER">("PASSENGER");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const signingUp = mode === "signup";
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (signingUp && fullName.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }
    if (signingUp && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      const session = await api<{
        token: string;
        user: {
          id: string;
          name: string;
          role: "DRIVER" | "PASSENGER";
          email: string;
        };
      }>(signingUp ? "/api/v1/auth/signup" : "/api/v1/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify(signingUp
          ? { name: fullName.trim(), email: normalizedEmail, password, role }
          : { email: normalizedEmail, password }),
      });
      localStorage.setItem("teslapool-session", JSON.stringify(session));
      router.push(session.user.role === "DRIVER" ? "/driver" : "/passenger");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[1fr_.88fr]">
      <section className="relative flex min-h-[240px] flex-col justify-between overflow-hidden bg-forest px-6 py-7 text-white sm:min-h-[270px] sm:px-10 lg:min-h-screen lg:px-12 lg:py-12">
        <Link href="/" className="relative z-10 flex items-center gap-3 font-bold">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-mint text-xl text-forest">
            T
          </span>
          TESLAPOOL
        </Link>
        <div className="relative z-10 mt-8 max-w-xl lg:mt-0 lg:pb-12">
          <p className="mb-4 text-xs font-bold uppercase tracking-[.2em] text-mint">
            Your seat is waiting
          </p>
          <h1 className="text-3xl font-semibold leading-tight tracking-[-.04em] sm:text-4xl lg:text-6xl lg:leading-[1.03]">
            The city feels closer when we ride together.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/65 sm:text-base lg:mt-6 lg:leading-7">
            One little electric Bullet. Three seats. A smarter way to move
            through Dhaka.
          </p>
          <div className="mt-5 flex items-center gap-3 text-xs font-semibold text-white/75 sm:mt-7">
            <span className="h-2.5 w-2.5 rounded-full bg-mint" />
            <span>Banani</span>
            <span className="text-mint">→</span>
            <span>Mohakhali · Gulshan 1</span>
          </div>
        </div>
        <p className="relative z-10 mt-7 text-xs text-white/40 lg:mt-0">
          Banani, Dhaka · Electric shared rides
        </p>
        <div className="absolute -bottom-28 -right-24 h-96 w-96 rounded-full border border-white/10" />
        <div className="absolute -bottom-16 -right-12 h-72 w-72 rounded-full border border-white/10" />
      </section>
      <section className="flex min-h-[calc(100vh-240px)] items-center justify-center px-5 py-12 sm:min-h-[calc(100vh-270px)] lg:min-h-screen">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-10 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 lg:hidden"
          >
            ← Dhaka Tesla Pool
          </Link>
          <div className="grid grid-cols-2 rounded-full bg-white p-1" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              onClick={() => { setMode("signin"); setError(""); }}
              className={`rounded-full px-4 py-3 text-sm font-semibold transition ${mode === "signin" ? "bg-emerald-900 text-white" : "text-slate-500 hover:text-ink"}`}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              onClick={() => { setMode("signup"); setError(""); }}
              className={`rounded-full px-4 py-3 text-sm font-semibold transition ${mode === "signup" ? "bg-emerald-900 text-white" : "text-slate-500 hover:text-ink"}`}
            >
              Create Account
            </button>
          </div>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-.04em]">
            {mode === "signin" ? "Sign in to Tesla Pool" : "Create your account"}
          </h2>
          <p className="mt-3 text-sm text-slate-500">
            {mode === "signin" ? "Enter your account details to continue." : "Join the ride with a secure account."}
          </p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === "signup" && (
              <>
                <label className="block text-sm font-semibold">
                  Full Name
                  <input
                    autoComplete="name"
                    className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-forest focus:ring-2 focus:ring-emerald-700/20"
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Your full name"
                    required
                    minLength={2}
                    value={fullName}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Role
                  <select
                    className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-forest focus:ring-2 focus:ring-emerald-700/20"
                    onChange={(event) => setRole(event.target.value as "PASSENGER" | "DRIVER")}
                    value={role}
                  >
                    <option value="PASSENGER">Passenger</option>
                    <option value="DRIVER">Driver</option>
                  </select>
                </label>
              </>
            )}
            <label className="block text-sm font-semibold">
              Email address
              <input
                autoComplete="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-forest focus:ring-2 focus:ring-emerald-700/20"
              />
            </label>
            <label className="block text-sm font-semibold">
              {mode === "signin" ? "Password" : "Password"}
              <input
                autoComplete="current-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-forest focus:ring-2 focus:ring-emerald-700/20"
              />
            </label>
            {mode === "signup" && (
              <label className="block text-sm font-semibold">
                Confirm Password
                <input
                  autoComplete="new-password"
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-forest focus:ring-2 focus:ring-emerald-700/20"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your password"
                  required
                  minLength={8}
                  type="password"
                  value={confirmPassword}
                />
              </label>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="w-full rounded-full bg-emerald-900 py-4 text-sm font-bold text-white transition hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy
                ? (mode === "signin" ? "Signing in…" : "Creating account…")
                : <>{mode === "signin" ? "Continue" : "Create Account"} <span aria-hidden="true" className="ml-2 text-mint">↗</span></>}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
