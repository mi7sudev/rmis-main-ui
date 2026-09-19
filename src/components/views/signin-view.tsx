"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { useSession } from "@/components/session-provider";
import { useNav } from "@/components/nav-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Reveal } from "@/components/ui/motion/reveal";
import { Loader2, Eye, EyeOff, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";

const TEST_ACCOUNTS = [
  { label: "Administrator", username: "testadmin", password: "password123" },
  { label: "Evaluator", username: "testevaluator", password: "password123" },
  { label: "Applicant", username: "testapplicant", password: "password123" },
];

// ============================================================================
// Sign-In — RMIS × Accenture: a self-contained page on the mode-aware canvas.
// Bold split layout on sm+: left = the form on a flat bg-card panel (sharp
// corners, h-12 inputs, blue focus edge, demo credentials note); right = brand
// editorial (gold kicker, display-hero headline "Molding the future of metal
// industries" in a single uniform display face, sharp primary/gold accent
// blocks). No shadows, no gradients, no pills.
// ============================================================================
export function SignInView() {
  const { refresh } = useSession();
  const { navigate } = useNav();
  const reduced = useReducedMotion();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier || !password) {
      toast.error("Please enter your email/username and password");
      return;
    }
    setLoading(true);
    try {
      // apiFetch owns the error policy: network failures and 4xx/5xx all
      // arrive as user-safe Error messages (the login route always sets a
      // 4xx message, e.g. "Invalid credentials").
      const userData = await apiFetch<{ role: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      toast.success("Welcome to RMIS");
      await refresh();
      const role = userData?.role;
      if (role === "ADMIN") navigate("operations");
      else if (role === "EVALUATOR") navigate("review-queue");
      else navigate("home");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Header — unified SiteHeader (same as frontpage + jobs board) */}
      <SiteHeader />

      {/* Main — split form / editorial (form first — left on desktop, top on mobile).
          The composition lives on the shared wide-screen container scale so the
          form no longer hugs the left viewport edge: at lg the form column is
          proportional and the 440px panel centers inside it, balancing the
          brand editorial on the right. Hero type steps down mid-range — the
          longest display line measures ≈5.7em, so the stock 7vw clamp
          overflowed the brand column across the lg band (real horizontal
          scroll at 1024–1279px). */}
      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col 2xl:max-w-[1680px] lg:flex-row lg:px-8">
        {/* ===== Left — the form ===== */}
        <section className="flex w-full items-start justify-center border-b border-border px-4 pb-16 pt-10 sm:px-6 lg:w-[46%] lg:shrink-0 lg:items-center lg:border-b-0 lg:border-r lg:px-0 lg:py-16 xl:w-[44%]">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[440px]"
          >
            {/* Form panel */}
            <div className="border border-border bg-card p-6 sm:p-8">
              <p className="kicker kicker-gold">Sign in</p>
              <h2 className="heading-md mt-3 text-foreground">Access your workspace</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Use your RMIS credentials — email address or username.
              </p>

              {/* Form — fields stagger in after the header */}
              <form onSubmit={onSubmit} className="mt-8 space-y-5">
                <Reveal delay={0.3} y={16}>
                  <div className="space-y-2">
                    <Label htmlFor="identifier">Email address or username</Label>
                    <Input
                      id="identifier"
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="juan.delacruz@example.com"
                      autoComplete="username"
                      required
                    />
                  </div>
                </Reveal>
                <Reveal delay={0.36} y={16}>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                        className="pr-12"
                      />
                      {/* Show/hide toggle — ghost icon button */}
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-0 inline-flex size-12 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                </Reveal>
                <Reveal delay={0.42} y={16}>
                  <Button type="submit" size="lg" disabled={loading} className="w-full">
                    {loading ? <Loader2 className="size-5 animate-spin" /> : null}
                    {loading ? "Signing in…" : "Sign in"}
                    {!loading && <ArrowRight className="size-4" />}
                  </Button>
                </Reveal>
              </form>

              {/* Footer link — opposite page */}
              <p className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground">
                New to RMIS?{" "}
                <button onClick={() => navigate("signup")} className="font-medium text-primary transition-colors hover:text-brand-light">
                  Create an account
                </button>
              </p>
            </div>

            {/* Demo accounts — flat bordered note (click to autofill) */}
            <div className="mt-4 border border-border bg-secondary p-5">
              <p className="kicker text-muted-foreground">Demo accounts</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Click a chip to autofill · password <span className="font-semibold text-foreground">password123</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {TEST_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.username}
                    type="button"
                    onClick={() => {
                      setIdentifier(acc.username);
                      setPassword(acc.password);
                    }}
                    className="min-h-11 border border-input px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:border-input-hover hover:bg-accent"
                  >
                    {acc.label} · {acc.username}
                  </button>
                ))}
              </div>
            </div>

            {/* Back to the board */}
            <button
              onClick={() => navigate("jobs")}
              className="link-arrow mt-6 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to positions
            </button>
          </motion.div>
        </section>

        {/* ===== Right — brand editorial ===== */}
        <section className="flex flex-1 flex-col justify-between px-4 pb-12 pt-12 sm:px-6 sm:pt-16 lg:pb-16 lg:pl-16 lg:pr-0 lg:pt-24 xl:pl-24">
          <div>
            <p className="kicker kicker-gold">RMIS — Recruitment portal</p>
            {/* lg override needs `!`: .display-hero is declared later in the
                utilities layer, so a plain responsive utility loses the tie.
                Longest line ≈ 5.68em → 6vw+0.5rem fits the brand column from
                1024px up (was 7vw → real horizontal overflow at lg). */}
            <h1 className="display-hero mt-6 text-foreground lg:text-[clamp(2.75rem,6vw+0.5rem,6.25rem)]!">
              Molding
              <br />
              the future
              <br />
              of metal
              <br />
              industries
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-foreground/60">
              Recruitment Management &amp; Information System. Access your dashboard, applications, and evaluation workspace.
            </p>
          </div>

          {/* Sharp accent blocks — colour-blocking depth, sparingly */}
          <div aria-hidden className="mt-12 flex items-end gap-2">
            <div className="block-primary h-20 w-1.5" />
            <div className="block-gold size-3" />
            <div className="block-ink size-3" />
          </div>
        </section>
        </div>
      </main>

      {/* Footer — same container scale as the split above */}
      <footer className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 2xl:max-w-[1680px]">
        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} DOST-MIRDC · Protected under RA 10173
        </p>
      </footer>
    </div>
  );
}
