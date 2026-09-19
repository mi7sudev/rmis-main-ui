"use client";

import React from "react";
import { motion } from "motion/react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { Card, CardContent } from "./card";
import { cn } from "@/lib/utils";
import { ensureDotLottieWasm } from "@/lib/dotlottie-wasm";

export interface EmptyResultProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Optional custom visual (e.g. an icon block). When provided it replaces
   *  the default dotLottie animation above the title. */
  children?: React.ReactNode;
}

/**
 * Empty result — animated (dotLottie + motion entrance).
 * Staggered heading/description reveal on mount; system Card styling
 * (sharp corners, flat panel — depth from the block, never shadows).
 */
const EmptyResult = ({
  title = "No Data Found",
  description = "It looks like there's nothing here yet!",
  action,
  className,
  children,
}: EmptyResultProps) => {
  ensureDotLottieWasm();
  const textVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <Card className={cn("mx-auto max-w-sm", className)}>
        <CardContent className="flex flex-col items-center px-6 py-2">
          {children ? (
            <div className="mt-6" aria-hidden>
              {children}
            </div>
          ) : (
            <div className="h-32 w-32" aria-hidden>
              <DotLottieReact src="/dot-lottie/empty.lottie" loop autoplay />
            </div>
          )}

          {/* Animated heading */}
          <motion.h2
            initial="initial"
            animate="animate"
            variants={textVariants}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mt-4 text-center text-xl font-semibold tracking-[-0.01em] text-foreground"
          >
            {title}
          </motion.h2>

          {/* Animated description */}
          <motion.p
            initial="initial"
            animate="animate"
            variants={textVariants}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="mt-2 max-w-xs text-center text-sm text-muted-foreground"
          >
            {description}
          </motion.p>

          {action && (
            <motion.div
              initial="initial"
              animate="animate"
              variants={textVariants}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
              className="mt-5"
            >
              {action}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default EmptyResult;
