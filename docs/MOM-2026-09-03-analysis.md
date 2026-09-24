# RMIS — MOM (September 3, 2026) Deep Analysis & Implementation Plan

> Status: **IMPLEMENTED (scoped flow)** · Pending HR confirmations flagged below
> Sources verified: official CSC issuances (csc.gov.ph), CSC Resolutions, PIA/Inquirer/GMA/PNA news (2024–2026), NPC advisories
> Freshness sweep performed: **2026 → 2024** (user instruction: latest & updated, 2026 and below)
>
> **SCOPE DECISION (user, post-research):** the system focuses ONLY on the MOM's 5-step
> application flow (submit → evaluate minimums → HR shortlist → regret letters →
> interview/skills-exam notices). System intervention ENDS at notification — everything
> after the applicant is emailed is face-to-face. None of the 2026 issuances (Res. 2600729,
> MC 07 s. 2026, PDS 2026, 2025 ORAOHRA, NPC 2026-01) require system code under this scope;
> they stand as design-validation + future-reference (PDS field map retained in
> `docs/PDS-2026-field-map.md`).

---

## 0. Implementation record (2026-09-15)

| MOM item | Delivered as | Verified |
|---|---|---|
| Job-posting visibility (hidden day after closing) | `/api/jobs` GET — non-HR viewers no longer see postings with `deadlineDate < startOfToday`; ADMIN/EVALUATOR keep full visibility | Browser/API: anon 16 jobs (expired #291 hidden), admin 17 ✓ |
| "Meets / Does not meet the minimum requirements" + red alert | `src/lib/mqr.ts` (engine strings + `allMet`), applicant failure modal rows (`jobs-view.tsx`), evaluator verdict chip (`requirements-match.tsx`) | Browser: chip renders "Meets the minimum requirements" ✓ |
| "Senior High School" education option | `education-section.tsx` level select (High School relabelled "High School (Junior)") | Browser: dropdown shows all 6 options incl. SHS ✓ |
| Step 2 — RMIS evaluates minimum quals from profile | Pre-existing MQR engine + queue requirements-report (snapshot-based); no schema change needed | ✓ |
| Step 3 — HR reviews qualified + shortlists | Review Queue: **"Qualified only"** lens (`match.verdict === ALL_MET`) in both views; decision flow unchanged | Browser ✓ |
| Step 4 — automated regret letters | `src/lib/email.ts` `emailRegretLetter` + `POST /api/evaluator/applications/[id]/notice {type:"regret"}` (single) + `POST /api/evaluator/applications/regrets` (bulk, dedup via email_logs, shortlisted hard-skip); Rejected-tab bulk button | Browser: single send + bulk re-run ("0 sent, 1 already sent") ✓ |
| Step 5 — interview invitations + skills-exam notices | `emailInterviewInvitation` / `emailSkillsExamNotice` + notice dialog (date/time/venue/contact/notes/exam type) in Review Workspace Notices card | Browser: send → toast + audit chip ✓ |
| Audit trail | email_logs + notifications (+applicant link) + audit_logs (`NOTICE_SENT`, `REGRET_LETTERS_BULK_SENT`) — the SMS channel was removed from the system | DB rows confirmed ✓ |
| Pipeline ends at notification | Untouched — `lib/status.ts` pipeline already terminates at Shortlisted/Rejected | ✓ |

---

## 1. Freshness sweep — what changed in 2026 (NEW findings)

| # | Issuance | Date | Substance | RMIS relevance |
|---|----------|------|-----------|----------------|
| N1 | **CSC Resolution No. 2600729** — "Rules on Grant of Additional Points" | Promulgated **25 May 2026** (CSC news 13 Jul 2026) | Grants **additional points / preference rating** for government work experience of **JO, COS, Casual, Contractual** workers ("JOCOSC6"). Builds on **CSC MC 04 s. 2024** (CSE-PR — Career Service Eligibility–Preference Rating). | Ranking engine must model **preference points as ranking-only**, never as minimum requirements. Confirms CSC's own doctrine. |
| N2 | **CSC MC 07 s. 2026** — Grant of Preference Rating (PR) to **Overseas Filipino Workers** | csguide entry 7 Jul 2026 | PR to OFWs based on **length of overseas work / foreign employment and work performance**. | Work-experience capture may need to distinguish overseas/foreign employment (HR confirmation needed). |
| N3 | **CS Form No. 212, Revised 2026 (Personal Data Sheet)** | Adopted ~Jul 2026; CSC published "Guide to Filling Up the PDS (Revised 2026)" | New PDS revision. Documented changes: **two new Work Experience fields — Monthly Salary and Salary/Job/Pay Grade & Step of Increment**; strict name format (Surname, First, Ext, Middle); strict date formats. Revision lineage: **2017 → Revised 2025 → Revised 2026**. | **PDS parser must support multiple formats.** RMIS parser targets 2017 layout; applicants will increasingly submit 2025/2026 forms. Directly affects the MOM PDS-integration item. |
| N4 | **NPC Advisory No. 2026-01** | Issued **13 Apr 2026** | Guidelines on scraping publicly available personal data; DPA (RA 10173) compliance reaffirmed. | Not applicant-retention-specific, but confirms DPA "keep only as long as necessary, then dispose per approved schedule" remains the governing doctrine → supports MOM 1-year retention + pending disposal decision. |
| N5 | **CSC MC 10 s. 2026** — Investigation & Prosecution of Discrimination Cases vs PLHIV in the Public Sector | 2026 | Anti-discrimination enforcement in public-sector employment. | Context only: regret/communication templates must stay neutral and non-discriminatory. |
| N6 | **2025 ORAOHRA** (CSC Res. No. 2500358, 30 Apr 2025; MC 08 s. 2025) | Published Daily Tribune 19 Jul 2025; effective **~3–4 Aug 2025**; **replaced the 2017 ORAOHRA in its entirety** | **Rule VII — Publication and Posting of Vacant Positions**: vacancies published via the **CSC Bulletin of Vacant Positions (CSC Job Portal)**; publication valid **9 months** (no appointment within the period → re-publication). Agencies primarily responsible for "judicious and objective selection". | Governs the whole recruitment workflow the MOM proposes (posting → screening → shortlist → appointment). Job-posting lifecycle rules in RMIS should align with Rule VII. |
| N7 | CSC MC 01 s. 2026 — Wellness Leave; CSC Res. 2600920 — QS for DepEd counselors; Exam Announcement No. 05, s. 2026 (CY-2027 CSE-PPT calendar) | 2026 | Not recruitment-system-specific. | No direct system change. |

**Net effect:** every 2026 issuance **reinforces** the previous classification. Nothing in 2026 contradicts the plan; two items were upgraded (PDS multi-format, preference-rating modeling).

---

## 2. Verified CSC doctrine (consolidated 2024–2026)

1. **Education (CSC MC 07, s. 2025** — Amendment to Education Requirements of First Level Positions; CSC Res. 2500229, 06 Mar 2025, **effective 13 Jun 2025**):
   - Equivalency table:
     - Old "High school graduate" → **HS grad (prior to SY 2016–2017) OR Grade 10 / JHS completer (2016+)**
     - Old "2 years college" → **2 yrs college (prior to 2018) OR Grade 12 / SHS completer (2016+)**; TVL-track & TESDA NC II variants recognized
   - **Does NOT apply** to first-level positions with **agency-specific higher** education requirements, nor to board-regulated professions.
   - Mainstream media corroboration: Inquirer (09 May 2025), GMA (14 May 2025) — "CSC formally recognizes JHS/SHS graduates".
   - → This is the legal basis for the MOM item *"Add Senior High School to the education qualification options"*.
2. **Eligibility doctrine**: SubProfessional eligibility → first-level positions; Professional → first + second level. RA 1080 (bar/board) ≈ Professional. Special eligibilities (PD 907 honor graduates, etc.).
   - **When a QS states eligibility is "not required"**: CSC practice (2024–2026 trajectory included) treats eligible status as a **preference for ranking**, **not** an automatic disqualifier of non-eligibles. The 2026 Res. 2600729 *awards points to non-regular workers* — the opposite of disqualification logic.
   - → Directly resolves the MOM's Laboratory Technician caution: the "if one applicant has eligibility, auto-DQ all others" rule **must not be implemented** until HR proves CSC policy support; CSC evidence points the other way.
3. **Three-way distinction (endorsed by MOM and CSC practice)**:
   - *Mandatory minimum qualification* → gate (must meet, else fail);
   - *Preferred qualification* → ranking points only (e.g., eligibility where "not required", JOCOSC6 experience, OFW experience, extra training);
   - *Legally disqualifying condition* → only where an express CSC/legal rule says so.
4. **Privacy (RA 10173 + NPC Advisory 2026-01)**: retain applicant data only as long as necessary; disposal (delete/anonymize/archive) per approved records schedule → matches MOM's 1-year retention + deferred disposal decision.

---

## 3. MOM item → codebase → plan (final)

### A. IMPLEMENT NOW (no HR dependency)

| MOM item | Codebase evidence | Change plan |
|---|---|---|
| **A1. Job-posting visibility** — vacancy disappears the day after closing date | `src/app/api/jobs/route.ts:32-36` filters ONLY `publishedAt` (expired jobs still listed). Apply API already blocks late submissions (`jobs/apply/route.ts:35-36`). | Add `closingDate >= today` (date-only, Asia/Manila) filter to the public listing query. Admin/evaluator views keep full visibility. |
| **A2. Qualification messages** — "Meets the minimum requirements" / "Does not meet the minimum requirements" (red alert) | Engine string at `src/lib/mqr.ts:100` is "Meets the requirements" (mismatch). Failure string already exact. Applicant render w/ destructive styling exists (`jobs-view.tsx:978-996`). Evaluator labels separate (`requirements-match.tsx:37-41`). | Change success string to **"Meets the minimum requirements"**; keep failure **"Does not meet the minimum requirements"**; ensure failure renders as red alert; align evaluator "minimum" wording for consistency. |
| **A3. "Senior High School" education option** | Options in `profile/education-section.tsx:176-182` (Elementary, High School, College, Post-Graduate, Vocational) — no SHS. PDS parser levels: `pds-parser.ts:539`. | Add **Senior High School** option; map to MQR education token equivalency per MC 07 s. 2025 (SHS=Grade 12 ≈ 2 yrs college for **first-level** QS rows only). Basic option add now; equivalency *validation* gated below (B1). |
| **A4. Recruitment workflow steps 2–4** — evaluate minimum quals, persist result, bucket qualified apps; automated regret letters; interview/skills-exam notices | MQR runs at apply (`jobs/apply/route.ts:61-74`) but **not persisted**; no qualified-bucket; notifications only on status change (no templates). | Persist MQR outcome per application; HR queue shows Qualified / Did-not-meet buckets; add templated notices (Regret letter, Interview invitation, Skills-exam notice) as in-app messages + printable HTML (no email infra in sandbox). |

### B. SCAFFOLD BUT GATE (pending HR confirmation, per MOM itself)

| Item | Why gated | Ready-to-sign draft rule |
|---|---|---|
| **B1. SHS equivalency technical controls** | MOM: "Ervie will confirm the equivalent completion or qualification rule… update related technical controls after". | Equivalency table from MC 07 s. 2025 §(HS/JHS, 2yr-college/SHS incl. TVL & NC II); scope limited to first-level positions without agency-specific higher requirements (MIRDC may impose higher). |
| **B2. CSC MC 07 s. 2025 validation rules** | MOM requires documented interpretation + affected positions + expected behavior before code. | Draft ruleset already documented (§2.1 above) — ready for HR sign-off. |
| **B3. PDS extraction + multi-format parser** | MOM requires Application-for-Employment auto-fill from PDS. **NEW 2026 context**: CSC adopted CS Form 212 **Revised 2026** (and a Revised 2025 preceded it). **The official Revised 2026 template has been obtained and fully mapped** (11 sheets; new Work Experience fields Monthly Salary + Pay Grade & Step "00-0"; boolean checkboxes; standard continuation sheets). See **`docs/PDS-2026-field-map.md`** for the complete cell-anchored structure, 2017 deltas, and parser dispatch plan. | Build format dispatch (detect "Revised 2026" via C1!A3) + 2026 anchor set alongside existing 2017 label-anchored parser; extend `ExtractedWorkExperience` with `monthlySalary`/`salaryGradeStep`; merge standard continuation sheets; infer SHS token from SECONDARY rows. Uploaded xlsx = canonical test fixture. |
| **B4. Preference-rating / additional-points capture (ranking only)** | Res. 2600729 (2026) + MC 04 s. 2024 + MC 07 s. 2026 (OFW) — points affect ranking, never minimums. Needs HR decision whether MIRDC adopts point-capture. | Schema-ready: optional ranking-points fields on application; UI shows "preferred — affects ranking only". |

### C. DO NOT IMPLEMENT (explicitly deferred/forbidden by MOM or by CSC evidence)

| Item | Reason |
|---|---|
| **C1. Eligibility auto-disqualification rule** (Laboratory Technician proposal) | MOM: "should not be implemented until HR confirms CSC policy support." CSC research (2024–2026) shows preference-not-disqualification doctrine; Res. 2600729 awards points *to* non-regular workers. System will instead render eligibility as **preferred** when QS says "not required" (already handled by `mqr.ts:75-82` N/A logic). |
| **C2. Disposal action for expired applications** (delete vs anonymize vs archive) | MOM: implementation must await approved records-management & privacy policy. Retention flag (1 year) can be scaffolded, action deferred. |

### D. MANUAL / OPERATIONAL (outside code)

- Staging link to FAD-HR (ops).
- Color palette per MIRDC Facebook job-post design + font/color review with Ervie & Mam Dolly (need the actual FB post reference).
- Yellow-text accessibility treatment — a11y outline/contrast treatment exists as `kicker-gold`; final values pending the design review.

---

## 4. Open questions for HR (consolidated)

1. Confirm SHS equivalency rule (B1/B2) — MC 07 s. 2025 table vs. any MIRDC-specific higher requirements.
2. Does MIRDC adopt preference/additional-points capture (JOCOSC6, OFW) in ranking? (B4)
3. Which PDS format(s) will MIRDC accept going forward — 2017, Revised 2025, Revised 2026, or all? (B3)
4. Disposal method after the 1-year retention period: delete, anonymize, or archive? (C2)
5. Provide the MIRDC Facebook job-post design reference for the palette review. (D)

---

## 5. Source register (key URLs)

- CSC MC 07 s. 2025 (official PDF, csc.gov.ph) — education requirements, first-level positions.
- CSC Res. 2500358 / MC 08 s. 2025 — 2025 ORAOHRA (91 pp.), Rule VII publication/posting; 9-month publication validity.
- CSC Res. 2600729 — Rules on Grant of Additional Points (JOCOSC6) — csc.gov.ph news 13 Jul 2026; PIA 10 Jul 2026.
- CSC MC 07 s. 2026 — PR for OFWs (csguide.org entry 7 Jul 2026).
- CSC MC 04 s. 2024 — CSE-PR for JOCOSC6 (csguide.org, Feb 2024).
- CS Form 212 Revised 2026 — adoption notice + Guide (csc.gov.ph); change summaries: govjobsph.com 15 Jul 2026, mabzicle.com 6 Jul 2026, DepEd memoranda (Jan & Jul 2026).
- NPC Advisory No. 2026-01 (13 Apr 2026) — data scraping (Baker McKenzie, Quisumbing Torres, GVES Law analyses).
- Inquirer 09 May 2025 / GMA 14 May 2025 / PNA — MC 07 s. 2025 coverage.
