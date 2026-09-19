// Lightweight allowlist-based HTML sanitizer.
// Strips scripts, event handlers, and dangerous tags/attributes from
// admin-authored rich text (job descriptions, compensation packages, etc.).
// No jsdom dependency — works in both server and client via regex parsing.

const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "span", "div",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "strong", "b", "em", "i", "u", "s", "sub", "sup",
  "a", "blockquote", "code", "pre",
  "table", "thead", "tbody", "tr", "th", "td",
]);

const ALLOWED_ATTR = new Set(["href", "target", "rel", "class", "colspan", "rowspan"]);

const DANGEROUS_TAGS = /<\/?(script|style|iframe|object|embed|form|input|textarea|select|button|link|meta|base|svg|math)\b[^>]*>/gi;

const ON_ATTR = /\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

const JAVASCRIPT_URL = /(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]*)/gi;

const DATA_ATTR = /\s+data-[\w-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

const STYLE_ATTR = /\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  let clean = dirty;

  // 1. Remove entire dangerous tags (with their content for script/style)
  clean = clean.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  clean = clean.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  clean = clean.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");
  clean = clean.replace(DANGEROUS_TAGS, "");

  // 2. Remove event handler attributes (onclick, onerror, onload, etc.)
  clean = clean.replace(ON_ATTR, "");

  // 3. Remove javascript: URLs
  clean = clean.replace(JAVASCRIPT_URL, 'href="#"');

  // 4. Remove data-* attributes (no data attrs allowed)
  clean = clean.replace(DATA_ATTR, "");

  // 5. Remove style attributes (inline CSS can carry expressions/imports)
  clean = clean.replace(STYLE_ATTR, "");

  // 6. Strip tags not in the allowlist — keep their text content
  clean = clean.replace(/<\/?(\w+)/g, (match, tag) => {
    return ALLOWED_TAGS.has(tag.toLowerCase()) ? match : "";
  });
  // Close any orphaned angle brackets from stripped tags
  clean = clean.replace(/[^<]*>/g, (m) => (m === ">" ? "" : m));

  // 7. For <a> tags, force rel="noopener noreferrer" and target="_blank"
  clean = clean.replace(/<a\b([^>]*)>/gi, (match, attrs) => {
    // strip existing target/rel
    let a = attrs.replace(/\s+target\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    a = a.replace(/\s+rel\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    // only keep allowed attributes
    const keptAttrs: string[] = [];
    const attrRegex = /(\w[\w-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g;
    let am;
    while ((am = attrRegex.exec(a)) !== null) {
      if (ALLOWED_ATTR.has(am[1].toLowerCase())) {
        keptAttrs.push(`${am[1]}=${am[2]}`);
      }
    }
    return `<a ${keptAttrs.join(" ")} target="_blank" rel="noopener noreferrer">`;
  });

  // 8. For all other tags, strip non-allowed attributes
  clean = clean.replace(/<(\w+)\b([^>]*)>/gi, (match, tag, attrs) => {
    if (tag.toLowerCase() === "a") return match; // already handled
    const keptAttrs: string[] = [];
    const attrRegex = /(\w[\w-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g;
    let am;
    while ((am = attrRegex.exec(attrs)) !== null) {
      if (ALLOWED_ATTR.has(am[1].toLowerCase())) {
        keptAttrs.push(`${am[1]}=${am[2]}`);
      }
    }
    return `<${tag}${keptAttrs.length ? " " + keptAttrs.join(" ") : ""}>`;
  });

  return clean;
}
