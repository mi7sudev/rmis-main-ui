"use client";

// ============================================================================
// HOW TO APPLY — compact 3-step application guide band on a raised surface
// (white slab on the light canvas / ember #242424 on obsidian — the flat
// colour-blocking rhythm between the jobs grid and the footer).
//
//   01 Browse positions   — pick the role that matches your qualifications
//   02 Prepare documents  — PDS (CS Form 212) + supporting records
//   03 Submit on time     — RMIS account → complete profile → file application
//
// CTAs hand off to sign-up / sign-in (the conversion path for the only
// audience that sees this page: signed-out visitors). whileInView reveals,
// instant under reduced motion.
// ============================================================================

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const STEPS = [
  {
    n: "01",
    title: "Browse positions",
    copy: "Review the open plantilla vacancies and find the role that matches your qualifications.",
  },
  {
    n: "02",
    title: "Prepare your requirements",
    copy: "Have your Personal Data Sheet (CS Form 212), eligibility records, and supporting documents ready.",
  },
  {
    n: "03",
    title: "Submit before the deadline",
    copy: "Create your RMIS account, complete your profile, and file your application before the posting closes.",
  },
] as const;

export function HowToApply({
  onSignUp,
  onSignIn,
}: {
  onSignUp: () => void;
  onSignIn: () => void;
}) {
  const reduced = useReducedMotion();

  return (
    <section
      id="how-to-apply"
      aria-labelledby="how-to-apply-title"
      className="scroll-mt-24 border-b border-border bg-surface text-foreground"
    >
      <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {/* Band header — kicker + display, support line right-aligned on sm+ */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="kicker kicker-gold">How to apply</p>
            <h2 id="how-to-apply-title" className="display-lg mt-3 text-foreground">
              Three steps to your application
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Everything happens online — from account creation to application
            tracking. No walk-ins required.
          </p>
        </div>

        {/* Steps — hairline-divided columns on md+, stacked on mobile */}
        <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
          {STEPS.map((step, i) => (
            <motion.li
              key={step.n}
              initial={reduced ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.5,
                delay: i * 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="md:px-8 md:first:pl-0 md:last:pr-0"
            >
              <p aria-hidden className="stat-numeral text-4xl text-foreground/15">
                {step.n}
              </p>
              <h3 className="mt-3 text-lg font-medium text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {step.copy}
              </p>
            </motion.li>
          ))}
        </ol>

        {/* Band CTAs — primary conversion pair */}
        <div className="mt-12 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onSignUp}
            className="group inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-primary px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Create an account
            <ArrowRight
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
              strokeWidth={2.5}
            />
          </button>
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex h-12 items-center justify-center rounded-full border border-input px-8 text-sm font-medium text-foreground transition-colors hover:border-input-hover"
          >
            Sign in
          </button>
        </div>
      </div>
    </section>
  );
}
