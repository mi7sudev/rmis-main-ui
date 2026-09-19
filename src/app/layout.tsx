import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { SmoothScrollProvider } from "@/components/providers/smooth-scroll-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

// Accenture design language — Inter stands in for Graphik (UI + body
// workhorse, weights 400–900 for the high-contrast hierarchy). Fraunces
// stands in for GT Sectra Fine: editorial serif moments on display headings.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
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
  // Match the mobile browser chrome to each sheet (white canvas / charcoal).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#16181D" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${fraunces.variable} font-sans antialiased`}>
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
