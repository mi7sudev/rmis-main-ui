"use client";

import { sanitizeHtml } from "@/lib/sanitize";

// Renders HTML that has been sanitized at write time (API) AND at render time.
// Defense in depth: even if a stored XSS payload slipped past the API
// sanitization, this component strips it before injection.
// For admin-authored rich text only (job descriptions, compensation, etc.).
export function SafeHtml({ html, className }: { html: string | null | undefined; className?: string }) {
  const clean = sanitizeHtml(html);
  if (!clean) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
