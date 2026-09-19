# CS Form No. 212 — Revised 2026 (PDS): Structure & Parser Field Map

> Source: `upload/CS Form No. 212 Revised 2026 Personal Data Sheet PDS.xlsx` (official template, 148 KB)
> Purpose: ground the RMIS PDS-parser upgrade (MOM item "Application for Employment populated from PDS")
> Verified by direct cell inspection (openpyxl) — coordinates below are from THIS template.

---

## 1. Workbook inventory — 11 sheets (2017 had 4 + Lookup)

| Sheet | Role | Grid |
|---|---|---|
| `C1` | Page 1 — I. Personal Information · II. Family Background · III. Educational Background · signature | A1:R265 (col Q rows 12–217 = hidden country dropdown list; col P = civil-status option list) |
| `C2` | Page 2 — IV. Civil Service Eligibility · V. Work Experience · signature | A1:N49 |
| `C3` | Page 3 — VI. L&D/Trainings · VII. Voluntary Work · VIII. Other Information · signature | A1:M48 |
| `C4` | Page 4 — items 34–42 (disclosure questions, references, oath/ID/photo) | A1:O71 |
| `C5_L&D cont.` | L&D continuation | A1:M70 |
| `C6_Work Exp cont.` | Work Experience continuation (same columns as C2 §V) | A1:N48 |
| `C7_Family Background cont. ` | Spouse + children continuation (⚠️ trailing space in sheet name; spouse column order differs: SURNAME \| MIDDLE \| FIRST; stray country list in col O) | A1:O164 |
| `C8_Educ. Background cont.` | Education continuation | A1:N44 |
| `C9_Elig cont.` | Eligibility continuation (license column header here reads "Valid Until") | A1:K59 |
| `C10_Vol. Work cont.` | Voluntary work continuation | A1:L60 |
| `C11_Other Info cont.` | Other info continuation | A1:K36 |

**Format fingerprint** for dispatch: `C1!A2="CS Form No. 212"` + `C1!A3="Revised 2026"` (2017 template differs; parser should branch on the `Revised YYYY` token and default to legacy handling if absent).

## 2. Section map with anchors (label → data cells)

### C1 — I. PERSONAL INFORMATION (items 1–21)
| # | Field | Anchor label (cell) | Value target |
|---|---|---|---|
| 1 | Surname | `B10` | `C10` (merged → rightward scan) |
| 2 | First name / Middle name / Name extension | `B11`, `B12`, `L11` | rightward |
| 3 | Date of birth **(dd/mm/yyyy)** | `B13` | rightward |
| 4 | Place of birth | `B15` | rightward |
| 5 | Sex at birth | `B16` | boolean checkboxes `D16`/`E16` (TRUE/FALSE cell values) |
| 6 | Civil status | `B17` | boolean checkboxes `D17:E18` block + col P option list = noise |
| 7 | Height (m) | `B22` | rightward |
| 8 | Weight (kg) | `B24` | rightward |
| 9 | Blood type | `B25` | rightward |
| 10–15 | UMID / Pag-IBIG / PhilHealth / PhilSys PCN / TIN / Agency Employee No. | `B27`–`B34` | rightward |
| 16 | Citizenship (+ dual details) | `G13`; dual prompt `G15/G16`; country fields `L15/M14` | col Q list = noise |
| 17 | Residential address (house/lot, street, subd/village, barangay, city/municipality, province, ZIP) | `G17`; labels `I18,L18,I21,L21,I23,L23,G24` | adjacent cells |
| 18 | Permanent address | `G25` | same structure |
| 19–21 | Telephone / Mobile / E-mail | `G32`, `G33`, `G34` | rightward |

### C1 — II. FAMILY BACKGROUND (items 22–25)
- 22 Spouse (`B36`–`B42`): surname, first, name-extension (`G37`), middle, occupation, employer, business address, tel.
- 23 Children name+DOB grid (`I36`, header `M36`) → **table** until marker `(Continue on sheet C7 if necessary)` at `A43`.
- 24 Father (`B44`), 25 Mother's maiden name (`B47`).

### C1 — III. EDUCATIONAL BACKGROUND (item 26) → table
- Header row `A52:N52`: LEVEL | NAME OF SCHOOL | BASIC EDUCATION/DEGREE/COURSE | PERIOD OF ATTENDANCE (From `J54` / To `K54`, yyyy) | HIGHEST LEVEL/UNITS EARNED | YEAR GRADUATED | SCHOLARSHIP/ACADEMIC HONORS.
- Level rows (`B55:B59`): **ELEMENTARY · SECONDARY · VOCATIONAL/TRADE COURSE · COLLEGE · GRADUATE STUDIES** — ⚠️ **no separate "Senior High School" level** (SHS lives inside SECONDARY's course text, e.g. "Grade 12 – Senior High School (STEM)"). Continuation: C8.

### C2 — IV. CIVIL SERVICE ELIGIBILITY (item 27) → table
- Header `A3:M4`: title (CAREER SERVICE/RA 1080 (BOARD/BAR) UNDER SPECIAL LAWS/CES/CSEE/BARANGAY ELIGIBILITY) | RATING (if applicable) | DATE OF EXAMINATION/CONFERMENT | PLACE | LICENSE: NUMBER + **Date of Validity** (C9 continuation header: "Valid Until").

### C2 — V. WORK EXPERIENCE (item 28) → table
- Header `A15:M17`: INCLUSIVE DATES (dd/mm/yyyy) From/To | POSITION TITLE | DEPARTMENT/AGENCY/OFFICE/COMPANY | **MONTHLY SALARY** 🆕 | **SALARY/JOB/PAY GRADE (if applicable) & STEP INCREMENT — Format "00-0"** 🆕 | STATUS OF APPOINTMENT | GOV'T SERVICE (Yes/No). Continuation: C6.

### C3 — VI. L&D INTERVENTIONS/TRAININGS (item 29) → table
- TITLE | INCLUSIVE DATES (From/To) | NUMBER OF HOURS | **Type of L&D (Managerial/Supervisory/Technical/etc)** | CONDUCTED/SPONSORED BY. ⚠️ Section order vs 2017 swapped (L&D now VI, before Voluntary Work). Continuation: C5.

### C3 — VII. VOLUNTARY WORK (item 30) → table
- NAME & ADDRESS OF ORGANIZATION | INCLUSIVE DATES (From/To) | NUMBER OF HOURS | POSITION/NATURE OF WORK. Continuation: C10.

### C3 — VIII. OTHER INFORMATION (items 31–33)
- Special skills & hobbies (`B38`) · Non-academic distinctions (`D38`) · Memberships (`J38`). Continuation: C11.

### C4 — items 34–42 (disclosures)
- 34 consanguinity (a. 3rd degree `H6`-bool, b. 4th degree LGU) · 35 administrative offense / **criminally charged (+ 🆕 Date Filed `I20`, Status of Case/s `H21`)** · 36 conviction · 37 separation from service · 38 election candidacy / resignation pre-election · 39 immigrant/PR status · 40 Indigenous group / PWD / Solo parent (+ID nos) · 41 REFERENCES table (NAME | OFFICE/RESIDENTIAL ADDRESS | CONTACT NO. AND/OR EMAIL) · 42 oath: Government Issued ID, ID no., date/place of issuance, photo, right thumbmark, person administering oath.
- Yes/No answers are stored as **boolean cell values** (e.g. `H6=True`, `J6=False`), not text.

## 3. Deltas vs Revised 2017 (parser-relevant)

1. **11 standard continuation sheets** with fixed names (`C5_L&D cont.` … `C11_Other Info cont.`, note trailing spaces) — must be parsed, not treated as noise. Existing parser already handles generic continuation sheets; add the standard names to recognition.
2. **Work Experience gains 2 fields**: MONTHLY SALARY; SALARY/JOB/PAY GRADE & STEP ("00-0").
3. **Criminal-charge detail**: Date Filed + Status of Case/s (item 35b).
4. **Section order swap in C3**: VI = L&D, VII = Voluntary (2017: VI = Voluntary, VII = Training). Label-anchored scanning is immune; hard-coded section indexes are not.
5. **Country list noise moved** to C1 col Q (rows 12–217) and C7 col O; civil-status options in C1 col P.
6. **Boolean checkboxes** (TRUE/FALSE cell values) for sex, civil status, and all C4 yes/no — parser must map boolean → the checkbox's label.
7. **License validity** wording differs between C2 ("Date of Validity") and C9 ("Valid Until").
8. Education still has **no dedicated SHS level** → RMIS "Senior High School" option (MOM item A3) must be inferred from SECONDARY rows' course text (tokens: "Senior High School", "Grade 12", "SHS", "STEM/ABM/HUMSS/GAS/TVL", "K-12").
9. ⚠️ C7 spouse sub-fields ordered SURNAME | MIDDLE | FIRST (C1: SURNAME | FIRST | MIDDLE) — don't assume ordering across pages.

## 4. Implementation plan (RMIS)

- **Dispatch**: read `C1!A2/A3` → if contains "Revised 2026" (or future "Revised YYYY") → 2026 mode; else legacy 2017 mode. Shared field-extraction core with per-format anchors; keep label-anchored scanning (already layout-shift tolerant).
- **Schema**: extend `ExtractedWorkExperience` with optional `monthlySalary` + `salaryGradeStep`; extend charge-related fields with `dateFiled`/`caseStatus` (extraction layer; profile mapping optional).
- **Continuation merge**: treat standard continuation sheets as primary-table overflow (same column order) — merge rows into their parent tables.
- **SHS inference**: education rows at SECONDARY level whose course/school text matches SHS tokens → ALSO emit an "Senior High School" education token for MQR equivalency (per MC 07 s. 2025, gated by HR confirmation for validation rules).
- **Boolean mapping**: `TRUE`→adjacent label (e.g., D16↔MALE, E16↔FEMALE; H/J pairs on C4 = Yes/No).
- **Testing fixture**: this uploaded xlsx becomes the canonical 2026 fixture (blank form → all fields null, zero false-positives from country/civil-status noise lists).

## 5. Status in MOM plan

- Belongs to **B3 (PDS extraction, multi-format)** — scaffold-gated pending HR confirmation of which PDS versions MIRDC accepts; but format detection + 2026 anchors can be built now without behavioral risk.
- Feeds **A4** (auto-populate Application for Employment from parsed PDS).
