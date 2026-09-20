"use client";

import { useState } from "react";
import { useSession } from "@/components/session-provider";
import { useNav } from "@/components/nav-provider";
import { apiFetch } from "@/lib/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Reveal } from "@/components/ui/motion/reveal";
import { Loader2, Check, Eye, EyeOff, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";

// ============================================================================
// Sign-Up — RMIS × Accenture: the split-layout sibling of sign-in. Left =
// brand editorial (gold kicker, display-hero + serif moment, sharp accent
// blocks); right = the form on a flat bg-card panel divided by hairlines.
// Privacy notice = flat bordered note; consent = sharp square with an
// electric-blue check; submit = ui Button lg. No shadows, no gradients.
// ============================================================================
export function SignUpView() {
  const { refresh } = useSession();
  const { navigate } = useNav();
  const reduced = useReducedMotion();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", confirm: "" });
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function update(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (form.password !== form.confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (!agreed) {
      toast.error("Please accept the Privacy Notice to continue");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      // Auto-login. Deliberately tolerant: if it fails (e.g. session cookie
      // blocked), fall back to the sign-in screen — the account exists.
      try {
        await apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ identifier: form.email, password: form.password }),
        });
      } catch {
        toast.success("Account created. Please sign in to continue.");
        navigate("signin");
        return;
      }
      toast.success("Account created successfully");
      await refresh();
      navigate("profile");
    } catch (e) {
      // apiFetch never throws TypeError (network failures are folded into
      // user-safe Error messages), so no instanceof sniffing is needed.
      toast.error(e instanceof Error ? e.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const legendCls = "kicker kicker-gold";

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Header — unified SiteHeader (same as frontpage + jobs + signin) */}
      <SiteHeader />

      {/* Main — split editorial / form (single column on mobile), on the shared
          wide-screen container scale — mirrors sign-in: proportional columns,
          panel centered in its column, so the composition stays balanced on
          wide monitors instead of pinning the form to the right edge. */}
      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col 2xl:max-w-[1680px] lg:flex-row lg:px-8">
        {/* ===== Left — brand editorial ===== */}
        <section className="flex flex-1 flex-col justify-between border-b border-border px-4 pb-12 pt-12 sm:px-6 sm:pt-16 lg:border-b-0 lg:border-r lg:pb-16 lg:pl-0 lg:pr-16 lg:pt-24 xl:pr-20">
          <div>
            <p className="kicker kicker-gold">RMIS — Applicant registration</p>
            <h1 className="display-hero mt-6 text-foreground">
              Join
              <br />
              <span className="display-serif italic normal-case">MIRDC.</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-foreground/60">
              Apply for positions at DOST-MIRDC. Build your profile, upload documents, and track every application stage.
            </p>
          </div>

          {/* Sharp accent blocks — colour-blocking depth, sparingly */}
          <div aria-hidden className="mt-12 flex items-end gap-2">
            <div className="block-primary h-20 w-1.5" />
            <div className="block-gold size-3" />
            <div className="block-ink size-3" />
          </div>
        </section>

        {/* ===== Right — the form ===== */}
        <section className="flex w-full items-start justify-center px-4 pb-16 pt-10 sm:px-6 lg:w-[50%] lg:shrink-0 lg:items-center lg:px-0 lg:py-16">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[560px]"
          >
            {/* Form panel — sections divided by hairlines */}
            <form onSubmit={onSubmit} className="border border-border bg-card">
              <Reveal delay={0.3} y={16}>
                {/* § 1 — Personal Information */}
                <fieldset className="space-y-4 border-b border-border p-6 sm:p-8">
                  <legend className={legendCls}>01 · Personal information</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">
                        First name <span className="text-danger-ink">*</span>
                      </Label>
                      <Input id="firstName" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required placeholder="Juan" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">
                        Last name <span className="text-danger-ink">*</span>
                      </Label>
                      <Input id="lastName" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required placeholder="Dela Cruz" />
                    </div>
                  </div>
                </fieldset>
              </Reveal>

              <Reveal delay={0.36} y={16}>
                {/* § 2 — Account Credentials */}
                <fieldset className="space-y-4 border-b border-border p-6 sm:p-8">
                  <legend className={legendCls}>02 · Account credentials</legend>
                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Email address <span className="text-danger-ink">*</span>
                    </Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required placeholder="juan.delacruz@example.com" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="password">
                        Password <span className="text-danger-ink">*</span>
                      </Label>
                      <div className="relative">
                        <Input id="password" type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => update("password", e.target.value)} required placeholder="Min. 6 characters" className="pr-12" />
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
                    <div className="space-y-2">
                      <Label htmlFor="confirm">
                        Confirm password <span className="text-danger-ink">*</span>
                      </Label>
                      <div className="relative">
                        <Input id="confirm" type={showConfirm ? "text" : "password"} value={form.confirm} onChange={(e) => update("confirm", e.target.value)} required placeholder="Re-enter password" className="pr-12" />
                        <button
                          type="button"
                          onClick={() => setShowConfirm((v) => !v)}
                          aria-label={showConfirm ? "Hide password" : "Show password"}
                          className="absolute inset-y-0 right-0 inline-flex size-12 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </fieldset>
              </Reveal>

              <Reveal delay={0.42} y={16}>
                {/* § 3 — Privacy Consent */}
                <fieldset className="space-y-4 p-6 sm:p-8">
                  <legend className={legendCls}>03 · Data privacy consent</legend>
                  {/* Privacy notice — flat bordered note */}
                  <div className="border border-border bg-secondary p-4">
                    <p className="kicker text-muted-foreground">Privacy notice · RA 10173</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      By registering, you consent to the collection, processing, and
                      storage of your personal data for recruitment purposes. Your
                      information will be handled confidentially and used solely for
                      evaluation of your application at DOST-MIRDC.
                    </p>
                  </div>
                  {/* Consent checkbox — sr-only native input inside the label, so the
                      WHOLE sentence is the tap target (label click-forwarding only
                      works for labelable elements, not <button>). The styled sharp
                      square below is purely visual, driven by `agreed`. */}
                  <label className="flex cursor-pointer items-start gap-3 border border-border p-4 transition-colors hover:border-input-hover hover:bg-secondary">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <span
                      aria-hidden
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center border transition-colors ${
                        agreed ? "border-primary bg-primary text-primary-foreground" : "border-input bg-transparent"
                      }`}
                    >
                      {agreed && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                    <span className="text-sm leading-relaxed text-foreground">
                      I have read and understand the Privacy Notice. I consent to the
                      processing of my personal data for recruitment purposes in
                      accordance with the Data Privacy Act of 2012.
                    </span>
                  </label>
                </fieldset>
              </Reveal>

              {/* Submit */}
              <Reveal delay={0.48} y={16}>
                <div className="border-t border-border p-6 sm:p-8">
                  <Button type="submit" size="lg" disabled={loading} className="w-full">
                    {loading ? <Loader2 className="size-5 animate-spin" /> : null}
                    {loading ? "Creating account…" : "Create account"}
                    {!loading && <ArrowRight className="size-4" />}
                  </Button>
                </div>
              </Reveal>
            </form>

            {/* Footer link — opposite page */}
            <p className="mt-6 text-sm text-muted-foreground">
              Already have an account?{" "}
              <button onClick={() => navigate("signin")} className="font-medium text-primary transition-colors hover:text-brand-light">
                Sign in
              </button>
            </p>

            {/* Back to the board */}
            <button
              onClick={() => navigate("jobs")}
              className="link-arrow mt-6 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to positions
            </button>
          </motion.div>
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
