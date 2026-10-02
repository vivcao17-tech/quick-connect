import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { GoogleSignIn } from "@/components/GoogleSignIn";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { logClientCardEvent } from "@/lib/card-events.functions";
import { getGuestToken } from "@/lib/guest";

function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return "/people";
  // Same-origin paths only — never bounce to an external URL.
  if (!value.startsWith("/") || value.startsWith("//")) return "/people";
  return value;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search["redirect"]),
  }),
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — NoSure" },
      { name: "description", content: "Sign in to your NoSure account." },
      { property: "og:title", content: "Sign in — NoSure" },
      { property: "og:description", content: "Sign in to your NoSure account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AuthPage() {
  const logEvent = useServerFn(logClientCardEvent);
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [code, setCode] = useState("");

  // Already signed in → go straight to where they were headed.
  useEffect(() => {
    let alive = true;
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!alive) return;
        if (data.user) {
          void navigate({ to: redirect, replace: true });
        } else {
          setChecking(false);
        }
      })
      // If the stored sign-in can't be read, show the sign-in options rather
      // than leaving the page stuck on "checking".
      .catch(() => {
        if (alive) setChecking(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") {
        void logEvent({ data: { event: "sign_in_completed", guestToken: getGuestToken(), profileId: session?.user.id } }).catch(() => undefined);
        void navigate({ to: redirect, replace: true });
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate, redirect, logEvent]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        void navigate({ to: redirect, replace: true });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMessage("Check your email to confirm your account, then come back and sign in.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function onCode(value: string) {
    const next = value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4);
    setCode(next);
    if (next.length === 4) void navigate({ to: "/join/$code", params: { code: next } });
  }

  if (checking) {
    return (
      <main className="paper flex min-h-screen items-center justify-center bg-background px-6">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="paper flex min-h-screen items-center justify-center bg-background px-6">
      <section className="w-full max-w-sm">
        <p className="text-sm tracking-[0.28em] text-muted-foreground uppercase">
          no<span className="text-primary">/</span>sure
        </p>
        <h1 className="mt-6 text-4xl">{mode === "signin" ? "Sign in" : "Create an account"}</h1>

        <div className="mt-8">
          <GoogleSignIn redirectPath={redirect} onError={setMessage} />
        </div>

        <p className="mt-6 text-sm text-muted-foreground">or use an email and password</p>

        <form onSubmit={(event) => void submit(event)} className="mt-3 flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            autoComplete="email"
            className="rounded-full border border-border bg-card px-5 py-3 outline-none focus:border-primary"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="rounded-full border border-border bg-card px-5 py-3 outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-ink hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMessage(null);
          }}
          className="mt-6 text-sm text-muted-foreground underline underline-offset-4"
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>

        <label className="mt-10 flex items-center gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
          <span>Got a code?</span>
          <input value={code} onChange={(event) => onCode(event.target.value)} autoCapitalize="characters" autoComplete="off" maxLength={4} aria-label="Four letter room code" className="w-32 rounded-full border border-border bg-card px-4 py-2 text-center text-base tracking-[0.4em] uppercase outline-none focus:border-primary" />
        </label>
      </section>
    </main>
  );
}
