"use client";

import React from "react";
import { motion } from "motion/react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { Card, CardContent } from "./card";
import { cn } from "@/lib/utils";
import { ensureDotLottieWasm } from "@/lib/dotlottie-wasm";

export interface SuccessResultProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Success result — animated (dotLottie + staggered motion entrance).
 * System Card styling (sharp corners, flat panel — no shadows).
 */
const SuccessResult = ({
  title = "Success!",
  description = "Your operation was completed successfully.",
  action,
  className,
}: SuccessResultProps) => {
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
          <div className="h-32 w-32" aria-hidden>
            <DotLottieReact src="/dot-lottie/success.lottie" loop autoplay />
          </div>

          {/* Animated heading */}
          <motion.h2
            initial="initial"
            animate="animate"
            variants={textVariants}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mt-4 text-center text-xl font-semibold tracking-[-0.01em] text-success"
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

export default SuccessResult;
