/**
 * seed-fresh.ts — FRESH-START database reset + clean seed.
 *
 * WHY (user decision, 2026-09-15): the "production" database carried legacy
 * Strapi-era records — candidates with no login accounts, duplicate person
 * records, mock jobs/applications. The system is now a NEW stack (Next.js 16
 * + Prisma + SQLite) and the old data was only mockups, so we reset to a
 * clean database that matches the new stack and seed a small, coherent demo
 * dataset.
 *
 * WHAT IT DOES
 *   Phase A — wipes ALL domain tables (everything except the Strapi RBAC
 *             trio: up_roles / up_permissions / up_permissions_role_lnk)
 *             using a loop-until-clean delete (children before parents),
 *             then resets the AUTOINCREMENT counters of wiped tables.
 *   Phase B — seeds a coherent dataset:
 *               reference  : places, eligibilities, courses (published)
 *               positions  : 4 CSC-posted plantilla positions with MQR fields
 *               postings   : 4 open job postings (future deadlines)
 *               accounts   : testadmin / testevaluator / testapplicant /
 *                            mariasantos (all password123, bcrypt cost 10)
 *               candidates : 2 complete applicant profiles, EACH linked to a
 *                            login account (no orphan records)
 *               pipeline   : 4 applications covering every Kanban column
 *                            (Applied / Under Review / Shortlisted / Rejected)
 *                            with the same snapshot JSON the apply route writes
 *   Phase C — wipes the dedicated audit.db audit_logs (mock history).
 *
 * RUN:  DATABASE_URL=file:/home/z/my-project/db/production-data.db bun scripts/seed-fresh.ts
 * (the script force-sets DATABASE_URL itself, but the explicit env keeps intent visible)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Database } from "bun:sqlite";
import { join } from "path";

process.env.DATABASE_URL = "file:/home/z/my-project/db/production-data.db";
const db = new PrismaClient({ log: ["error"] });

const KEEP = new Set([
  "up_roles",
  "up_permissions",
  "up_permissions_role_lnk",
]);

const now = () => new Date();
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000);

async function wipeAll() {
  const tables = (await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
  )).map((t) => t.name).filter((t) => !KEEP.has(t));

  // Loop-until-clean: children delete first pass, parents on later passes.
  let remaining = new Set(tables);
  for (let pass = 1; pass <= 6 && remaining.size > 0; pass++) {
    const failed: string[] = [];
    for (const t of remaining) {
      try {
        await db.$executeRawUnsafe(`DELETE FROM "${t}"`);
      } catch {
        failed.push(t);
      }
    }
    remaining = new Set(failed);
    if (failed.length && pass === 6) {
      throw new Error(`Wipe failed for: ${failed.join(", ")}`);
    }
  }

  // Reset AUTOINCREMENT counters so the fresh DB starts ids at 1.
  await db.$executeRawUnsafe(
    `DELETE FROM sqlite_sequence WHERE name NOT IN ('up_roles','up_permissions','up_permissions_role_lnk')`
  );
  console.log(`[wipe] ${tables.length} domain tables cleared`);
}

async function seedReference() {
  const places = await Promise.all(
    ["Accounting Unit", "Human Resource Development Unit", "Metrology Laboratory", "Materials and Corrosion Laboratory"].map(
      (name) => db.placeOfAssignment.create({ data: { name, publishedAt: now() } })
    )
  );

  const eligibilities = await Promise.all(
    ["None Required", "Career Service Sub-Professional", "Career Service Professional"].map(
      (name, i) => db.eligibility.create({ data: { name, index: i, publishedAt: now() } })
    )
  );

  const COURSES: [string, string, string, string][] = [
    ["BS Business Administration", "BSBA", "Business", "College"],
    ["BS Accountancy", "BSA", "Business", "College"],
    ["BS Mechanical Engineering", "BSME", "Engineering", "College"],
    ["BS Electrical Engineering", "BSEE", "Engineering", "College"],
    ["BS Civil Engineering", "BSCE", "Engineering", "College"],
    ["BS Industrial Engineering", "BSIE", "Engineering", "College"],
    ["BS Computer Science", "BSCS", "Information Technology", "College"],
    ["BS Information Technology", "BSIT", "Information Technology", "College"],
    ["BS Chemistry", "BS Chem", "Natural Sciences", "College"],
    ["BS Physics", "BS Physics", "Natural Sciences", "College"],
    ["BS Biology", "BS Bio", "Natural Sciences", "College"],
    ["BS Psychology", "BSPsych", "Social Sciences", "College"],
    ["AB Political Science", "AB PolSci", "Social Sciences", "College"],
    ["Master of Science in Mechanical Engineering", "MSME", "Engineering", "Graduate"],
    ["Master of Public Administration", "MPA", "Public Administration", "Graduate"],
    ["Master in Business Administration", "MBA", "Business", "Graduate"],
  ];
  await Promise.all(
    COURSES.map(([name, abbri, category, level]) =>
      db.course.create({ data: { name, abbri, category, level, publishedAt: now() } })
    )
  );

  console.log("[seed] reference rows:", { places: places.length, eligibilities: eligibilities.length, courses: COURSES.length });
  return { places, eligibilities };
}

async function seedPositionsAndJobs({ places }: { places: { id: number }[] }) {
  const positions = await Promise.all([
    // First-level position — mirrors the CSC minimums the user tested with.
    db.position.create({
      data: {
        positionTitle: "ADMINISTRATIVE AIDE VI",
        positionType: "Plantilla",
        positionStatus: "Permanent",
        positionSalaryGrade: "6",
        salaryGrade: "6",
        salaryAmount: 22595,
        division: "Finance and Administrative Division",
        cscEducation: "High school graduate OR completion of relevant vocational/trade course",
        // null = no eligibility requirement (MQR auto-passes null/""/"N/A";
        // a literal "None Required" would tokenize to ["none","required"] and FAIL).
        cscEligibilityGroup: null,
        cscWorkExperience: "None Required",
        cscTrainingRequirements: "None Required",
        publishedAt: now(),
      },
    }),
    db.position.create({
      data: {
        positionTitle: "ADMINISTRATIVE OFFICER II",
        positionType: "Plantilla",
        positionStatus: "Permanent",
        positionSalaryGrade: "11",
        salaryGrade: "11",
        salaryAmount: 27600,
        division: "Finance and Administrative Division",
        cscEducation: "Bachelor's degree in Business Administration, Public Administration or relevant field",
        cscEligibilityGroup: "Career Service Professional",
        cscWorkExperience: "(1) year of relevant experience",
        cscTrainingRequirements: "(8) hours of relevant training",
        publishedAt: now(),
      },
    }),
    db.position.create({
      data: {
        positionTitle: "SCIENCE RESEARCH SPECIALIST I",
        positionType: "Plantilla",
        positionStatus: "Permanent",
        positionSalaryGrade: "13",
        salaryGrade: "13",
        salaryAmount: 32529,
        division: "Technical Services Division",
        cscEducation: "Bachelor's degree in Engineering, Natural Sciences or relevant field",
        cscEligibilityGroup: "Career Service Professional",
        cscWorkExperience: "(1) year of relevant experience in research or engineering",
        cscTrainingRequirements: "(8) hours of relevant training",
        publishedAt: now(),
      },
    }),
    db.position.create({
      data: {
        positionTitle: "SCIENCE RESEARCH SPECIALIST II",
        positionType: "Plantilla",
        positionStatus: "Permanent",
        positionSalaryGrade: "17",
        salaryGrade: "17",
        salaryAmount: 45209,
        division: "Technical Services Division",
        cscEducation: "Master's degree in Engineering or relevant natural science",
        cscEligibilityGroup: "Career Service Professional",
        cscWorkExperience: "(2) years of relevant experience",
        cscTrainingRequirements: "(16) hours of relevant training",
        publishedAt: now(),
      },
    }),
  ]);

  await Promise.all(
    positions.map((p, i) =>
      db.positionPlaceOfAssignmentLink.create({
        data: { postionId: p.id, placeOfAssignmentId: places[i % places.length].id },
      })
    )
  );

  const jobSpecs: { posIdx: number; vacancies: number; publish: Date; deadline: Date; brief: string }[] = [
    {
      posIdx: 0,
      vacancies: 2,
      publish: daysFromNow(-30),
      deadline: daysFromNow(45),
      brief: "Provides general clerical, records, and logistical support to the Finance and Administrative Division.",
    },
    {
      posIdx: 1,
      vacancies: 1,
      publish: daysFromNow(-20),
      deadline: daysFromNow(30),
      brief: "Handles procurement, property and supplies management, and administrative services coordination.",
    },
    {
      posIdx: 2,
      vacancies: 3,
      publish: daysFromNow(-15),
      deadline: daysFromNow(40),
      brief: "Conducts calibration services and R&D activities under the Metrology Laboratory.",
    },
    {
      posIdx: 3,
      vacancies: 1,
      publish: daysFromNow(-10),
      deadline: daysFromNow(25),
      brief: "Leads materials and corrosion research projects and mentors junior researchers.",
    },
  ];

  const jobs = [];
  for (const spec of jobSpecs) {
    const job = await db.jobPosting.create({
      data: {
        positionType: "Plantilla",
        publishDate: spec.publish,
        deadlineDate: spec.deadline,
        briefDescription: spec.brief,
        briefDescriptionRichtext: `<p>${spec.brief}</p>`,
        dutiesResponsibilities:
          "<ul><li>Perform the duties stated in the approved position description.</li><li>Support the division's mandates and annual targets.</li><li>Coordinate with client units as required.</li></ul>",
        compensationPackageRichtext:
          "<p>Monthly salary per CSC salary schedule. Includes statutory benefits (PERA, ACA,Representation Allowance where applicable), HDMF, PhilHealth, and GSIS coverage.</p>",
        otherQualificationsRichtext: "<p>Willingness to undergo background investigation. Government service experience is an advantage.</p>",
        numberOfVacancy: spec.vacancies,
        publishedAt: now(),
      },
    });
    await db.jobPostingPositionLink.create({
      data: { jobpostingId: job.id, postionId: positions[spec.posIdx].id },
    });
    jobs.push(job);
  }

  console.log("[seed] positions:", positions.length, "postings:", jobs.length);
  return { positions, jobs };
}

async function seedUsers() {
  const passwordHash = bcrypt.hashSync("password123", 10);
  const common = {
    password: passwordHash,
    provider: null as string | null,
    confirmed: true,
    blocked: false,
    publishedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  };

  const admin = await db.user.create({
    data: { ...common, username: "testadmin", email: "testadmin@rmis.test", isAdmin: true, firstName: "Test", lastName: "Admin" },
  });
  await db.userRoleLink.create({ data: { userId: admin.id, roleId: 1 } });

  const evaluator = await db.user.create({
    data: { ...common, username: "testevaluator", email: "testevaluator@rmis.test", isAdmin: false, firstName: "Test", lastName: "Evaluator" },
  });
  await db.userRoleLink.create({ data: { userId: evaluator.id, roleId: 1 } });

  const applicantUser = await db.user.create({
    data: { ...common, username: "testapplicant", email: "testapplicant@rmis.test", isAdmin: false, isApplicant: true, firstName: "Juan", lastName: "Dela Cruz", informationFillouted: true },
  });
  await db.userRoleLink.create({ data: { userId: applicantUser.id, roleId: 3 } });

  const mariaUser = await db.user.create({
    data: { ...common, username: "mariasantos", email: "maria.santos@rmis.test", isAdmin: false, isApplicant: true, firstName: "Maria", lastName: "Santos", informationFillouted: true },
  });
  await db.userRoleLink.create({ data: { userId: mariaUser.id, roleId: 3 } });

  console.log("[seed] users: testadmin, testevaluator, testapplicant, mariasantos (password123)");
  return { admin, evaluator, applicantUser, mariaUser };
}

type Ctx = { eligibilities: { id: number }[] };

async function seedJuan(ctx: Ctx, userId: number) {
  const applicant = await db.applicant.create({
    data: {
      firstName: "Juan",
      lastName: "Dela Cruz",
      emailAddress: "testapplicant@rmis.test",
      contactNumber: "09171234567",
      gender: "Male",
      civilStatus: "Single",
      citizenship: "Filipino",
      birthDate: "1992-05-14",
      birthPlace: "Makati City",
      presentAddress: "123 Rizal Street, Brgy. Poblacion, Makati City",
      city: "Makati City",
      province: "Metro Manila",
      country: "Philippines",
      zipCode: "1210",
      religion: "Roman Catholic",
      height: "170",
      weight: "65",
      bloodType: "O",
      isFillouted: true,
      publishedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    },
  });
  await db.userApplicantLink.create({ data: { userId, applicantId: applicant.id } });

  const edu = await Promise.all(
    [
      { educationLevel: "ELEMENTARY", schoolName: "Makati Elementary School", yearGraduated: "2004" },
      { educationLevel: "SECONDARY", schoolName: "Makati Science High School", yearGraduated: "2008" },
      { educationLevel: "COLLEGE", schoolName: "UP Diliman", course: "BS Business Administration", degree: "BS Business Administration", yearGraduated: "2012", isHighestEducation: true },
    ].map((e) =>
      db.applicantEducation.create({
        data: { ...e, yearFrom: e.yearGraduated ? String(parseInt(e.yearGraduated) - 4) : null, yearTo: e.yearGraduated, publishedAt: now() },
      })
    )
  );
  for (const [i, e] of edu.entries()) {
    await db.applicantEducationLink.create({ data: { applicantId: applicant.id, applicantEducationId: e.id, applicantEducationOrd: i } });
  }

  const wexp = await Promise.all(
    [
      { positionTitle: "Administrative Assistant II", employerName: "DOST-MIRDC", from: "2013-07-01", to: "2016-06-30", years: 3, salary: 28000, govt: true },
      { positionTitle: "Administrative Aide IV", employerName: "City Government of Makati", from: "2016-08-01", to: "2018-02-28", years: 2, salary: 20000, govt: true },
    ].map((w) =>
      db.applicantWorkExperience.create({
        data: {
          positionTitle: w.positionTitle,
          employerName: w.employerName,
          inclusiveDateFrom: new Date(w.from),
          inclusiveDateTo: new Date(w.to),
          isPresentWork: false,
          isGovtService: w.govt,
          statusOfEmployment: "Permanent",
          monthlySalary: w.salary,
          yearDecimal: w.years,
          actualDuties: "Administrative support, records management, procurement coordination.",
          publishedAt: now(),
        },
      })
    )
  );
  for (const [i, w] of wexp.entries()) {
    await db.applicantWorkExperienceLink.create({ data: { applicantId: applicant.id, applicantWorkExperienceId: w.id, applicantWorkExperienceOrd: i } });
  }

  const trn = await Promise.all(
    [
      { title: "Human Resource Management Seminar", hours: 16, from: "2020-03-02", to: "2020-03-04" },
      { title: "Records Management and Archives Training", hours: 12, from: "2021-06-14", to: "2021-06-16" },
    ].map((t) =>
      db.applicantTraining.create({
        data: {
          titleOfTraining: t.title,
          numberHours: t.hours,
          hourDecimal: t.hours,
          typeOfTraining: "Managerial",
          inclusiveDateFrom: new Date(t.from),
          inclusiveDateTo: new Date(t.to),
          publishedAt: now(),
        },
      })
    )
  );
  for (const [i, t] of trn.entries()) {
    await db.applicantTrainingLink.create({ data: { applicantId: applicant.id, applicantTrainingId: t.id, applicantTrainingOrd: i } });
  }

  const elig = await db.applicantEligibility.create({
    data: { rating: "86.4", examDate: new Date("2012-03-11"), examPlace: "CSC Central Office", licenseNumber: "1234567", publishedAt: now() },
  });
  await db.applicantEligibilityLink.create({ data: { applicantId: applicant.id, applicantEligibilityId: elig.id } });
  // Category link gives the eligibility its display title (loader path).
  await db.applicantEligibilityCategoryLink.create({
    data: { applicantEligibilityId: elig.id, eligibilityId: ctx.eligibilities[2].id },
  });

  const award = await db.applicantAward.create({
    data: {
      dateGranted: "2023-12-15",
      recognitionProvider: "DOST-MIRDC",
      recognitionType: "Award",
      awardType: "Non-Performance-Based",
      recognitionScope: "Agency",
      recognitionCategory: "Loyalty and Service",
      recognitionDetails: "Five years of loyal and dedicated service",
      publishedAt: now(),
    },
  });
  await db.applicantAwardLink.create({ data: { applicantId: applicant.id, applicantAwardId: award.id } });

  console.log("[seed] candidate: Juan Dela Cruz (testapplicant)");
  return applicant;
}

async function seedMaria(ctx: Ctx, userId: number) {
  const applicant = await db.applicant.create({
    data: {
      firstName: "Maria",
      lastName: "Santos",
      emailAddress: "maria.santos@rmis.test",
      contactNumber: "09181234567",
      gender: "Female",
      civilStatus: "Single",
      citizenship: "Filipino",
      birthDate: "1995-08-20",
      birthPlace: "Quezon City",
      presentAddress: "45 Katipunan Avenue, Brgy. Loyola Heights, Quezon City",
      city: "Quezon City",
      province: "Metro Manila",
      country: "Philippines",
      zipCode: "1108",
      religion: "Roman Catholic",
      height: "160",
      weight: "55",
      bloodType: "A",
      isFillouted: true,
      publishedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    },
  });
  await db.userApplicantLink.create({ data: { userId, applicantId: applicant.id } });

  const edu = await Promise.all(
    [
      { educationLevel: "ELEMENTARY", schoolName: "Quezon City Elementary School", yearGraduated: "2007" },
      { educationLevel: "SECONDARY", schoolName: "Quezon City Science High School", yearGraduated: "2011" },
      { educationLevel: "COLLEGE", schoolName: "UP Diliman", course: "BS Mechanical Engineering", degree: "BS Mechanical Engineering", yearGraduated: "2015", isHighestEducation: false },
      { educationLevel: "GRADUATE STUDIES", schoolName: "UP Diliman", course: "Master of Science in Mechanical Engineering", degree: "MS Mechanical Engineering", yearGraduated: "2018", isHighestEducation: true },
    ].map((e) =>
      db.applicantEducation.create({
        data: { ...e, yearFrom: e.yearGraduated ? String(parseInt(e.yearGraduated) - (e.educationLevel === "GRADUATE STUDIES" ? 3 : 4)) : null, yearTo: e.yearGraduated, publishedAt: now() },
      })
    )
  );
  for (const [i, e] of edu.entries()) {
    await db.applicantEducationLink.create({ data: { applicantId: applicant.id, applicantEducationId: e.id, applicantEducationOrd: i } });
  }

  const wexp = await Promise.all(
    [
      { positionTitle: "Research Assistant", employerName: "DOST-MIRDC", from: "2018-07-01", to: "2021-06-30", years: 3, salary: 32000, govt: true },
      { positionTitle: "Science Research Specialist I", employerName: "DOST-MIRDC", from: "2021-07-01", to: "2024-12-31", years: 3, salary: 39000, govt: true },
    ].map((w) =>
      db.applicantWorkExperience.create({
        data: {
          positionTitle: w.positionTitle,
          employerName: w.employerName,
          inclusiveDateFrom: new Date(w.from),
          inclusiveDateTo: new Date(w.to),
          isPresentWork: false,
          isGovtService: w.govt,
          statusOfEmployment: "Contractual",
          monthlySalary: w.salary,
          yearDecimal: w.years,
          actualDuties: "Calibration services, metrology research, laboratory documentation.",
          publishedAt: now(),
        },
      })
    )
  );
  for (const [i, w] of wexp.entries()) {
    await db.applicantWorkExperienceLink.create({ data: { applicantId: applicant.id, applicantWorkExperienceId: w.id, applicantWorkExperienceOrd: i } });
  }

  const trn = await Promise.all(
    [
      { title: "Metrology and Calibration Fundamentals", hours: 24, from: "2019-02-18", to: "2019-02-21" },
      { title: "Laboratory Quality Management Systems (ISO/IEC 17025)", hours: 16, from: "2022-09-05", to: "2022-09-07" },
    ].map((t) =>
      db.applicantTraining.create({
        data: {
          titleOfTraining: t.title,
          numberHours: t.hours,
          hourDecimal: t.hours,
          typeOfTraining: "Technical",
          inclusiveDateFrom: new Date(t.from),
          inclusiveDateTo: new Date(t.to),
          publishedAt: now(),
        },
      })
    )
  );
  for (const [i, t] of trn.entries()) {
    await db.applicantTrainingLink.create({ data: { applicantId: applicant.id, applicantTrainingId: t.id, applicantTrainingOrd: i } });
  }

  const elig = await db.applicantEligibility.create({
    data: { rating: "88.1", examDate: new Date("2015-10-18"), examPlace: "CSC NCR", licenseNumber: "7654321", publishedAt: now() },
  });
  await db.applicantEligibilityLink.create({ data: { applicantId: applicant.id, applicantEligibilityId: elig.id } });
  await db.applicantEligibilityCategoryLink.create({
    data: { applicantEligibilityId: elig.id, eligibilityId: ctx.eligibilities[2].id },
  });

  const award = await db.applicantAward.create({
    data: {
      dateGranted: "2024-11-20",
      recognitionProvider: "DOST-MIRDC",
      recognitionType: "Award",
      awardType: "Non-Performance-Based",
      recognitionScope: "Agency",
      recognitionCategory: "Scientific Achievement",
      recognitionDetails: "Best Scientific Paper Award — Metrology Research Track",
      publishedAt: now(),
    },
  });
  await db.applicantAwardLink.create({ data: { applicantId: applicant.id, applicantAwardId: award.id } });

  console.log("[seed] candidate: Maria Santos (mariasantos)");
  return applicant;
}

type SeedApplicant = { id: number; firstName: string | null; lastName: string | null; emailAddress: string | null; contactNumber: string | null; gender: string | null; civilStatus: string | null; citizenship: string | null; birthDate: string | null; presentAddress: string | null; city: string | null; province: string | null; country: string | null };

async function seedApplications(ju: SeedApplicant, ma: SeedApplicant, jobs: { id: number }[]) {
  // [applicant, jobIdx, status, daysAgoApplied, daysAgoUpdated]
  const specs: [SeedApplicant, number, string, number, number][] = [
    [ju, 0, "Applied", 1, 1],
    [ma, 1, "Under Review", 5, 1],
    [ma, 3, "Shortlisted", 6, 2],
    [ju, 1, "Rejected", 5, 1],
  ];

  // Fetch the full profile rows so snapshots carry the same shape the apply
  // route writes (loader rows, including the resolved eligibilityTitle).
  for (const [applicant, jobIdx, status, agoApplied, agoUpdated] of specs) {
    const appRow = await db.application.create({
      data: {
        dateApplied: daysFromNow(-agoApplied),
        applicationStatus: status,
        createdAt: daysFromNow(-agoApplied),
        updatedAt: daysFromNow(-agoUpdated),
        publishedAt: daysFromNow(-agoApplied),
      },
    });
    await db.applicationApplicantLink.create({ data: { applicationId: appRow.id, applicantId: applicant.id, applicationOrd: 0 } });
    await db.applicationJobLink.create({ data: { applicationId: appRow.id, jobpostingId: jobs[jobIdx].id, applicationOrd: 0 } });

    // Fetch rows through the explicit Strapi-style link tables (the Prisma
    // models are flat — no relation fields), same as lib/applicant-data.
    const byApplicant = async <T>(
      linkTable: "applicantEducationLink" | "applicantWorkExperienceLink" | "applicantTrainingLink" | "applicantEligibilityLink" | "applicantAwardLink",
      rowTable: "applicantEducation" | "applicantWorkExperience" | "applicantTraining" | "applicantEligibility" | "applicantAward",
      idField: string
    ): Promise<T[]> => {
      const links = await (db as any)[linkTable].findMany({ where: { applicantId: applicant.id } });
      const ids = links.map((l: any) => l[idField]).filter((x: any) => x != null);
      if (!ids.length) return [];
      const rows = await (db as any)[rowTable].findMany({ where: { id: { in: ids } } });
      const byId = new Map(rows.map((r: any) => [r.id, r]));
      return links.map((l: any) => (l[idField] ? byId.get(l[idField]) : undefined)).filter(Boolean);
    };
    const educations = await byApplicant("applicantEducationLink", "applicantEducation", "applicantEducationId");
    const workExperiences = await byApplicant("applicantWorkExperienceLink", "applicantWorkExperience", "applicantWorkExperienceId");
    const trainings = await byApplicant("applicantTrainingLink", "applicantTraining", "applicantTrainingId");
    const eligRows = await byApplicant("applicantEligibilityLink", "applicantEligibility", "applicantEligibilityId");
    const eligibilities = eligRows.map((r) => ({ ...r, eligibilityTitle: "Career Service Professional" }));
    const awards = await byApplicant("applicantAwardLink", "applicantAward", "applicantAwardId");

    const snapshotProfile = JSON.stringify({
      id: applicant.id,
      firstName: applicant.firstName,
      lastName: applicant.lastName,
      emailAddress: applicant.emailAddress,
      contactNumber: applicant.contactNumber,
      gender: applicant.gender,
      civilStatus: applicant.civilStatus,
      citizenship: applicant.citizenship,
      birthDate: applicant.birthDate,
      presentAddress: applicant.presentAddress,
      city: applicant.city,
      province: applicant.province,
      country: applicant.country,
      characterReference: null,
    });

    await db.$executeRawUnsafe(
      `UPDATE applications SET
        snapshot_profile = ?,
        snapshot_educations = ?,
        snapshot_experiences = ?,
        snapshot_trainings = ?,
        snapshot_eligibilities = ?,
        snapshot_awards = ?
      WHERE id = ?`,
      snapshotProfile,
      JSON.stringify(educations),
      JSON.stringify(workExperiences),
      JSON.stringify(trainings),
      JSON.stringify(eligibilities),
      JSON.stringify(awards),
      appRow.id
    );
  }

  console.log("[seed] applications: 1 Applied · 1 Under Review · 1 Shortlisted · 1 Rejected");
}

async function wipeAuditDb() {
  try {
    const audit = new Database(join(process.cwd(), "db", "audit.db"));
    audit.exec("DELETE FROM audit_logs");
    audit.close();
    console.log("[wipe] audit.db audit_logs cleared");
  } catch (e) {
    console.log("[wipe] audit.db skipped:", e instanceof Error ? e.message : e);
  }
}

async function main() {
  console.log("=== FRESH-START RESET + SEED ===");
  await wipeAll();
  const ref = await seedReference();
  const { jobs } = await seedPositionsAndJobs({ places: ref.places });
  const users = await seedUsers();
  const juan = await seedJuan({ eligibilities: ref.eligibilities }, users.applicantUser.id);
  const maria = await seedMaria({ eligibilities: ref.eligibilities }, users.mariaUser.id);
  await seedApplications(juan, maria, jobs);
  await wipeAuditDb();

  // Final counts sanity check
  const counts = {
    users: await db.user.count(),
    applicants: await db.applicant.count(),
    positions: await db.position.count(),
    jobs: await db.jobPosting.count(),
    applications: await db.application.count(),
  };
  console.log("[done] counts:", JSON.stringify(counts));
  await db.$disconnect();
}

main().catch((e) => {
  console.error("SEED FAILED:", e);
  process.exit(1);
});
