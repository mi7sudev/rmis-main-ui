"use client";

// ============================================================================
// FULL-WIDTH SHOWCASE BANNER — Samsung/Apple full-bleed image treatment.
// The image scales 1.18 → 1.00 as the banner traverses the viewport
// (scroll-scrubbed via FadeImage's scrubTarget) and dissolves in on decode.
// ASPECT-LOCKED CROP BOX: the box tracks the image's own 1702/630 ratio, so
// once the zoom settles at scale 1 the image fits the frame EXACTLY — full
// photo visible, nothing cropped top/bottom. The breakpoint min-heights only
// matter on narrow screens, where cover then crops the SIDES instead (never
// top/bottom). The crop-box ref lives HERE — it is only this section that
// FadeImage scrubs against.
// ============================================================================

import { useRef } from "react";
import { FadeImage } from "@/components/ui/motion/fade-image";

export function ShowcaseBanner() {
  const bannerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={bannerRef} className="w-full aspect-[1702/630] min-h-[240px] overflow-hidden border-y border-border sm:min-h-[320px] lg:min-h-[420px] xl:min-h-[480px]">
      <FadeImage
        src="/rmis-image2.jpg"
        alt="DOST-MIRDC facilities showcase"
        width={1702}
        height={630}
        scrubTarget={bannerRef}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
