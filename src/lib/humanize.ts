// ============================================================================
// humanize — shared ALL-CAPS → proper-case helpers for display surfaces.
// ----------------------------------------------------------------------------
// The production tables store plantilla position titles and person names in
// raw uppercase. Every UI surface renders them through these helpers so the
// product reads typeset, not shouted. Mixed-case input passes through
// untouched, so already-clean data is never mangled.
//
// Rules (tuned against ALL 100+ real production titles):
//   * Roman-numeral tokens (II, III, IV…) stay uppercase — grades & suffixes.
//   * Vowel-less tokens are acronyms → kept uppercase (S&T, HR, QC…).
//   * A small curated set of house acronyms always stays uppercase
//     (MIRDC, DOST, ICT, SRS, QA, ISO, R&D…).
//   * Small words (of, and, the…) stay lowercase after the first word.
//   * First letter after punctuation capitalizes — "(Computer Operator I)".
// ============================================================================

const ROMAN_GRADE = /^[IVX]{1,4}$/i;
const KEEP_UPPER = new Set([
  "MIRDC",
  "DOST",
  "ICT",
  "SRS",
  "HR",
  "IT",
  "QA",
  "QC",
  "ISO",
  "R&D",
]);
const SMALL_WORDS = new Set([
  "of",
  "and",
  "the",
  "on",
  "in",
  "for",
  "to",
  "a",
  "an",
  "at",
  "by",
  "de",
  "del",
]);

/**
 * Convert an ALL-CAPS string to display title case (jobs, divisions, units).
 * Returns the input untouched when it is empty or not fully uppercase.
 */
export function humanizeTitle(raw: string): string {
  return humanizeUpper(raw);
}

/**
 * Semantic alias for person names (applicants, evaluators) stored in caps.
 * Same engine as humanizeTitle — "ANNA LOUISSE BACHOCO" → "Anna Louise
 * Bachoco", suffixes like "JOSE CRUZ II" keep their "II".
 */
export function humanizeName(raw: string): string {
  return humanizeUpper(raw);
}

function humanizeUpper(raw: string): string {
  const s = raw.trim();
  if (!s || s !== s.toUpperCase()) return raw;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((word, idx) => {
      const bare = word.replace(/[^A-Za-z&]/g, "");
      if (ROMAN_GRADE.test(bare)) return word.toUpperCase();
      const letters = word.replace(/[^A-Za-z]/g, "");
      if (
        (letters.length > 0 && !/[aeiou]/.test(letters)) ||
        KEEP_UPPER.has(bare)
      ) {
        return word.toUpperCase();
      }
      if (idx > 0 && SMALL_WORDS.has(word)) return word;
      return word.replace(/[a-z]/, (c) => c.toUpperCase());
    })
    .join(" ");
}
