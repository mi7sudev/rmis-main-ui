import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { SmoothScrollProvider } from "@/components/providers/smooth-scroll-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

// ============================================================================
// RMIS DESIGN.md type system ("warm obsidian workshop"):
// · Inter stands in for saansFont — the primary typeface for ALL display,
//   heading, body, and UI text. Variable axis loaded so the spec's
//   non-standard weights work: 300 display / 380 body / 570 labels.
// · Space Grotesk stands in for pxGroteskFont — the monospace-adjacent
//   label voice for eyebrows, nav links, and micro-UI (+0.013em tracking).
// ============================================================================
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-label",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "RMIS — Recruitment Management & Information System | DOST-MIRDC",
  description:
    "Recruitment Management & Information System for the DOST-Metals Industry Research and Development Center. Apply for positions, manage applications, and streamline the evaluation process.",
  keywords: ["RMIS", "DOST", "MIRDC", "recruitment", "job application", "Philippines", "government jobs"],
  authors: [{ name: "DOST-MIRDC" }],
  icons: {
    icon: "/mirdc-logo.svg",
  },
};

// viewport-fit: cover exposes env(safe-area-inset-*) so shell surfaces
// (mobile drawer bottom, sticky rails) can respect notched/home-indicator
// devices. No user-scalable restriction — accessibility first.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Match the mobile browser chrome to each sheet (cool enterprise / obsidian).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8FA" },
    { media: "(prefers-color-scheme: dark)", color: "#151515" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans antialiased`}>
        <ThemeProvider>
          <SmoothScrollProvider>
            {children}
            <Toaster />
            <SonnerToaster richColors position="top-right" />
          </SmoothScrollProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
