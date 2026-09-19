"use client";

import React from "react";
import { motion } from "motion/react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { Button } from "./button";
import { Card, CardContent } from "./card";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { ensureDotLottieWasm } from "@/lib/dotlottie-wasm";

export interface ErrorResultProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Error result — animated (dotLottie + motion shake on mount).
 * Card shakes once (x/rotate keyframes) then the heading and description
 * stagger in; system Card styling (sharp corners, flat panel).
 */
const ErrorResult = ({
  title = "Error Occurred!",
  description = "There was a problem processing your request. Please try again.",
  onRetry,
  retryLabel = "Try again",
  action,
  className,
}: ErrorResultProps) => {
  ensureDotLottieWasm();
  const textVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
  };

  const cardShake = {
    initial: { x: 0 },
    animate: {
      x: [0, -10, 10, -10, 0],
      rotate: [0, -2, 2, -2, 0],
      transition: { duration: 0.6 },
    },
  };

  return (
    <motion.div variants={cardShake} initial="initial" animate="animate">
      <Card className={cn("mx-auto max-w-sm", className)}>
        <CardContent className="flex flex-col items-center px-6 py-2">
          <div className="h-32 w-32" aria-hidden>
            <DotLottieReact src="/dot-lottie/error.lottie" loop autoplay />
          </div>

          {/* Animated heading */}
          <motion.h2
            initial="initial"
            animate="animate"
            variants={textVariants}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mt-4 text-center text-xl font-semibold tracking-[-0.01em] text-destructive"
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

          {(onRetry || action) && (
            <motion.div
              initial="initial"
              animate="animate"
              variants={textVariants}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
              className="mt-5 flex items-center gap-2"
            >
              {onRetry && (
                <Button onClick={onRetry} size="sm" variant="outline">
                  <RefreshCw className="size-3.5" strokeWidth={1.5} />
                  {retryLabel}
                </Button>
              )}
              {action}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default ErrorResult;
