"use client";

import { setWasmUrl } from "@lottiefiles/dotlottie-react";

// dotlottie-web fetches its WASM rendering core from jsdelivr/unpkg by
// default — environments without public-internet access fail with
// "WASM loading failed from all sources". We serve the same file from the
// app itself (public/dot-lottie/dotlottie-player.wasm) and point the
// runtime at it once, before any <DotLottieReact> mounts.
let configured = false;

export function ensureDotLottieWasm(): void {
  if (configured) return;
  setWasmUrl("/dot-lottie/dotlottie-player.wasm");
  configured = true;
}
