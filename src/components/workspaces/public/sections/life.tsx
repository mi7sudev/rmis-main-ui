"use client";

// ============================================================================
// 03. LIFE AT DOST-MIRDC — Where Innovation Becomes Industry.
// Left: title + description (editorial) + gold pill CTA.
// Right: DriftWall — premium 3D image-wall (React Bits DriftWall port)
// showing the 18 Life-at-DOST-MIRDC photos drifting upward. The photo list
// (driftWallItems) lives HERE — only this section consumes it.
// ============================================================================

import { useNav } from "@/components/nav-provider";
import { useSession } from "@/components/session-provider";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { DriftWall, type DriftWallItem } from "@/components/ui/drift-wall/drift-wall";
import { MagneticButton } from "@/components/ui/motion/magnetic-button";

// DriftWall items — the 18 Life-at-DOST-MIRDC photos (uploaded by the user).
// Titles are short labels for the hover overlay.
const driftWallItems: DriftWallItem[] = [
  { image: "/03-section-image1.jpg", title: "Innovation" },
  { image: "/03-section-image2.jpg", title: "Research" },
  { image: "/03-section-image3.jpg", title: "Facilities" },
  { image: "/03-section-image4.jpg", title: "Teamwork" },
  { image: "/03-section-image5.jpg", title: "Technology" },
  { image: "/03-section-image6.jpg", title: "Industry" },
  { image: "/03-section-image7.jpg", title: "Excellence" },
  { image: "/03-section-image8.jpg", title: "Mentorship" },
  { image: "/03-section-image9.jpg", title: "Discovery" },
  { image: "/03-section-image10.jpg", title: "Growth" },
  { image: "/03-section-image11.jpg", title: "Precision" },
  { image: "/03-section-image12.jpg", title: "Collaboration" },
  { image: "/03-section-image13.jpg", title: "Craftsmanship" },
  { image: "/03-section-image14.jpg", title: "Engineering" },
  { image: "/03-section-image15.jpg", title: "Manufacturing" },
  { image: "/03-section-image16.jpg", title: "Automation" },
  { image: "/03-section-image17.jpg", title: "Prototyping" },
  { image: "/03-section-image18.jpg", title: "Community" },
];

export function LifeSection() {
  const { navigate } = useNav();
  const { user } = useSession();

  return (
    <section className="border-b border-parchment/10 bg-moss text-parchment">
      <div className="mx-auto max-w-[1400px] 2xl:max-w-[1680px]">
        <div className="grid lg:grid-cols-12">
          {/* Left — editorial copy */}
          <div className="lg:col-span-5 lg:border-r lg:border-white/15">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="flex h-full flex-col justify-center px-4 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-24"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-limestone">Life at DOST-MIRDC</p>
              <h2 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl lg:text-6xl">
                Where innovation becomes industry
              </h2>
              <p className="mt-8 max-w-md text-base leading-relaxed text-parchment/80">
                Discover the people, facilities, technologies, and opportunities
                that make DOST-MIRDC a place to build a meaningful career.
              </p>
              <div className="mt-10">
                <MagneticButton strength={0.25}>
                  <button
                    onClick={() => navigate(user ? "jobs" : "signin")}
                    className="group inline-flex h-12 items-center gap-2 rounded-full bg-[#E8A317] px-7 text-sm font-semibold text-[#112E81] shadow-soft transition-all hover:bg-[#F6C453] hover:shadow-lift"
                  >
                    {user ? "Browse positions" : "Get started"}
                    <ArrowRight className="size-5 transition-transform duration-200 group-hover:translate-x-1" />
                  </button>
                </MagneticButton>
              </div>
            </motion.div>
          </div>
          {/* Right — DriftWall image wall */}
          <div className="lg:col-span-7">
            <div style={{ height: 600 }}>
              <DriftWall
                items={driftWallItems}
                columns={5}
                tileWidth={200}
                tileHeight={132}
                gap={18}
                tilt={16}
                turn={-14}
                perspective={1200}
                depth={400}
                speed={42}
                direction="up"
                variance={0.45}
                parallax={0}
                lift={64}
                fade={0.6}
                dim={1}
                overlayColor="#212139"
                radius={14}
                roll={0}
                pauseOnHover={false}
                grayscale={false}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
