import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

async function main() {
  console.log("🌱 Seeding RMIS database...");

  const passwordHash = await bcrypt.hash("password123", 10);

  // ---- Create users for each role ----
  const admin = await db.user.upsert({
    where: { email: "admin@rmis.dost.gov.ph" },
    update: {},
    create: {
      email: "admin@rmis.dost.gov.ph",
      username: "admin",
      passwordHash,
      role: "ADMIN",
      firstName: "System",
      lastName: "Administrator",
    },
  });

  const evaluator = await db.user.upsert({
    where: { email: "evaluator@rmis.dost.gov.ph" },
    update: {},
    create: {
      email: "evaluator@rmis.dost.gov.ph",
      username: "evaluator",
      passwordHash,
      role: "EVALUATOR",
      firstName: "Maria",
      lastName: "Santos",
    },
  });

  const applicantUser = await db.user.upsert({
    where: { email: "juan.delacruz@example.com" },
    update: {},
    create: {
      email: "juan.delacruz@example.com",
      username: "juan.delacruz",
      passwordHash,
      role: "APPLICANT",
      firstName: "Juan",
      lastName: "Dela Cruz",
      emailVerified: new Date(),
    },
  });

  const applicant2User = await db.user.upsert({
    where: { email: "ana.reyes@example.com" },
    update: {},
    create: {
      email: "ana.reyes@example.com",
      username: "ana.reyes",
      passwordHash,
      role: "APPLICANT",
      firstName: "Ana",
      lastName: "Reyes",
      emailVerified: new Date(),
    },
  });

  // ---- Applicant profiles ----
  const applicant = await db.applicant.upsert({
    where: { userId: applicantUser.id },
    update: {},
    create: {
      userId: applicantUser.id,
      firstName: "Juan",
      lastName: "Dela Cruz",
      emailAddress: "juan.delacruz@example.com",
      gender: "Male",
      civilStatus: "Single",
      citizenship: "Filipino",
      birthDate: new Date("1995-04-15"),
      birthPlace: "Manila, Philippines",
      contactNumber: "09171234567",
      mobileNumber: "09171234567",
      presentAddress: "123 Mabini St., Quezon City, Metro Manila",
      city: "Quezon City",
      province: "Metro Manila",
      country: "Philippines",
      isPWD: false,
      adminCase: false,
      crimeCharge: false,
      isProfileComplete: true,
      submittedDate: new Date(),
      characterReferences: JSON.stringify([
        { name: "Dr. Pedro Cruz", title: "Professor", company: "UP Diliman", companyAddress: "QC", email: "pedro@up.edu.ph", contact: "09171112222" },
        { name: "Ms. Linda Tan", title: "HR Manager", company: "MIRDC", companyAddress: "Bicutan, Taguig", email: "linda@mirdc.dost.gov.ph", contact: "09173334444" },
      ]),
    },
  });

  const applicant2 = await db.applicant.upsert({
    where: { userId: applicant2User.id },
    update: {},
    create: {
      userId: applicant2User.id,
      firstName: "Ana",
      lastName: "Reyes",
      emailAddress: "ana.reyes@example.com",
      gender: "Female",
      civilStatus: "Married",
      citizenship: "Filipino",
      birthDate: new Date("1992-08-22"),
      birthPlace: "Cebu City, Philippines",
      contactNumber: "09185556677",
      mobileNumber: "09185556677",
      presentAddress: "456 Osmena Blvd., Cebu City",
      city: "Cebu City",
      province: "Cebu",
      country: "Philippines",
      isPWD: false,
      adminCase: false,
      crimeCharge: false,
      isProfileComplete: true,
      submittedDate: new Date(),
      characterReferences: JSON.stringify([
        { name: "Engr. Carlos Lim", title: "Division Chief", company: "MIRDC", companyAddress: "Bicutan, Taguig", email: "carlos@mirdc.dost.gov.ph", contact: "09197778888" },
      ]),
    },
  });

  // ---- Educations ----
  await db.applicantEducation.createMany({
    data: [
      {
        applicantId: applicant.id,
        educationLevel: "College",
        degree: "Bachelor of Science",
        course: "BS Metallurgical Engineering",
        schoolName: "University of the Philippines Diliman",
        yearGraduated: "2017",
        isHighestEducation: true,
      },
      {
        applicantId: applicant.id,
        educationLevel: "High School",
        schoolName: "Manila Science High School",
        yearGraduated: "2013",
      },
      {
        applicantId: applicant2.id,
        educationLevel: "Post-Graduate",
        degree: "Master of Science",
        course: "MS Materials Engineering",
        schoolName: "University of the Philippines Diliman",
        yearGraduated: "2020",
        isHighestEducation: true,
      },
    ],
    
  });

  // ---- Work Experiences ----
  await db.applicantWorkExperience.createMany({
    data: [
      {
        applicantId: applicant.id,
        positionTitle: "Junior Metallurgical Engineer",
        employerName: "MIRDC - DOST",
        employerAddress: "Bicutan, Taguig City",
        inclusiveDateFrom: new Date("2017-06-01"),
        inclusiveDateTo: new Date("2020-05-31"),
        isGovtService: true,
        statusOfEmployment: "Regular",
        monthlySalary: 35000,
        yearDecimal: 3.0,
      },
      {
        applicantId: applicant.id,
        positionTitle: "Senior Metallurgical Engineer",
        employerName: "MIRDC - DOST",
        employerAddress: "Bicutan, Taguig City",
        inclusiveDateFrom: new Date("2020-06-01"),
        isPresentWork: true,
        isGovtService: true,
        statusOfEmployment: "Regular",
        monthlySalary: 52000,
        yearDecimal: 6.0,
      },
      {
        applicantId: applicant2.id,
        positionTitle: "Research Specialist",
        employerName: "DOST-PCIEERD",
        employerAddress: "Bicutan, Taguig City",
        inclusiveDateFrom: new Date("2020-01-01"),
        isPresentWork: true,
        isGovtService: true,
        statusOfEmployment: "Regular",
        monthlySalary: 48000,
        yearDecimal: 6.0,
      },
    ],
    
  });

  // ---- Trainings ----
  await db.applicantTraining.createMany({
    data: [
      {
        applicantId: applicant.id,
        titleOfTraining: "Advanced Materials Characterization",
        typeOfTraining: "Technical",
        inclusiveDateFrom: new Date("2019-03-01"),
        inclusiveDateTo: new Date("2019-03-05"),
        numberHours: 40,
        hourDecimal: 40,
      },
      {
        applicantId: applicant.id,
        titleOfTraining: "Project Management for Engineers",
        typeOfTraining: "Managerial/Supervisory",
        inclusiveDateFrom: new Date("2021-09-01"),
        inclusiveDateTo: new Date("2021-09-03"),
        numberHours: 24,
        hourDecimal: 24,
      },
      {
        applicantId: applicant2.id,
        titleOfTraining: "Research Methods and Statistical Analysis",
        typeOfTraining: "Technical",
        inclusiveDateFrom: new Date("2022-02-01"),
        inclusiveDateTo: new Date("2022-02-04"),
        numberHours: 32,
        hourDecimal: 32,
      },
    ],
    
  });

  // ---- Eligibilities ----
  await db.applicantEligibility.createMany({
    data: [
      {
        applicantId: applicant.id,
        eligibilityTitle: "Registered Metallurgical Engineer",
        rating: "85.5",
        examDate: new Date("2017-09-01"),
        examPlace: "Manila",
        licenseNumber: "MTLE-2017-0123",
      },
      {
        applicantId: applicant2.id,
        eligibilityTitle: "Civil Service Professional",
        rating: "82.3",
        examDate: new Date("2018-05-01"),
        examPlace: "Cebu City",
      },
    ],
    
  });

  // ---- Awards ----
  await db.applicantAward.createMany({
    data: [
      {
        applicantId: applicant.id,
        recognitionType: "Award",
        awardType: "Internal",
        recognitionScope: "Individual",
        recognitionCategory: "Model Employee",
        recognitionDetails: "Model Employee of the Year 2022",
        recognitionProvider: "MIRDC-DOST",
        dateGranted: new Date("2022-12-15"),
        points: 20,
      },
    ],
    
  });

  // ---- Place of Assignment ----
  const mirdc = await db.placeOfAssignment.upsert({
    where: { name: "Metals Industry Research and Development Center" },
    update: {},
    create: { name: "Metals Industry Research and Development Center" },
  });

  // ---- Positions (with CSC qualification standards) ----
  const pos1 = await db.position.upsert({
    where: { itemNumber: "MIRDC-ENG-001" },
    update: {},
    create: {
      itemNumber: "MIRDC-ENG-001",
      positionTitle: "Senior Metallurgical Engineer",
      positionType: "Permanent",
      positionStatus: "Open",
      positionLevel: 3,
      salaryGrade: "18",
      salaryStep: "1",
      salaryAmount: 52000,
      division: "Research and Development",
      section: "Materials Engineering",
      classification: "Professional",
      cscEducation: "Bachelor's degree in Metallurgical Engineering, Materials Engineering, or related field",
      cscEligibility: "Registered Metallurgical Engineer",
      cscEligibilityGroup: "Professional",
      cscWorkExperience: "3 years relevant experience",
      cscTrainingRequirements: "40 hours relevant training",
      preferredQualification: "Experience in materials characterization",
      competencyRequirements: "Materials analysis, SEM, XRD",
      specialSkill: "Materials characterization",
      placeOfAssignmentId: mirdc.id,
    },
  });

  const pos2 = await db.position.upsert({
    where: { itemNumber: "MIRDC-RS-002" },
    update: {},
    create: {
      itemNumber: "MIRDC-RS-002",
      positionTitle: "Research Specialist II",
      positionType: "Permanent",
      positionStatus: "Open",
      positionLevel: 2,
      salaryGrade: "15",
      salaryStep: "2",
      salaryAmount: 38000,
      division: "Research and Development",
      section: "Research",
      classification: "Professional",
      cscEducation: "Bachelor's degree relevant to the job",
      cscEligibility: "N/A",
      cscEligibilityGroup: "N/A",
      cscWorkExperience: "2 years relevant experience",
      cscTrainingRequirements: "24 hours relevant training",
      preferredQualification: "Master's degree is an advantage",
      competencyRequirements: "Research, data analysis, report writing",
      specialSkill: "Statistical analysis",
      placeOfAssignmentId: mirdc.id,
    },
  });

  // ---- Job Postings ----
  const job1 = await db.jobPosting.create({
    data: {
      authorId: admin.id,
      positionId: pos1.id,
      title: "Senior Metallurgical Engineer",
      positionType: "Permanent",
      briefDescription:
        "Lead metallurgical research and materials characterization projects supporting the metals industry.",
      briefDescriptionHtml:
        "<p>Lead metallurgical research and materials characterization projects supporting the metals industry. Work on cutting-edge R&D for materials development, failure analysis, and process optimization.</p>",
      dutiesResponsibilities:
        "Conduct materials research; perform failure analysis; operate characterization equipment (SEM, XRD); prepare technical reports; mentor junior engineers.",
      dutiesResponsibilitiesHtml:
        "<ul><li>Conduct materials research</li><li>Perform failure analysis</li><li>Operate characterization equipment (SEM, XRD)</li><li>Prepare technical reports</li><li>Mentor junior engineers</li></ul>",
      compensationPackage: "Salary Grade 18, Step 1 (PHP 52,000/month) plus government benefits",
      compensationPackageHtml: "<p><strong>Salary Grade 18, Step 1</strong> (PHP 52,000/month)</p><ul><li>GSIS, PhilHealth, Pag-IBIG</li><li>13th Month Pay</li><li>RICE Allowance</li><li>Medical Allowance</li></ul>",
      otherQualifications: "Preferred: Master's degree; experience in failure analysis",
      otherQualificationsHtml: "<p>Preferred qualifications:</p><ul><li>Master's degree in Materials Engineering</li><li>Experience in failure analysis</li><li>Strong analytical skills</li></ul>",
      numberOfVacancy: 1,
      publishDate: new Date(),
      deadlineDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      processingDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      isActive: true,
    },
  });

  const job2 = await db.jobPosting.create({
    data: {
      authorId: admin.id,
      positionId: pos2.id,
      title: "Research Specialist II",
      positionType: "Permanent",
      briefDescription:
        "Support research initiatives through data collection, analysis, and report preparation.",
      briefDescriptionHtml:
        "<p>Support research initiatives through data collection, analysis, and report preparation. Collaborate with senior researchers on industry-funded projects.</p>",
      dutiesResponsibilities:
        "Collect and analyze research data; prepare technical reports; assist in project implementation; conduct field surveys.",
      dutiesResponsibilitiesHtml:
        "<ul><li>Collect and analyze research data</li><li>Prepare technical reports</li><li>Assist in project implementation</li><li>Conduct field surveys</li></ul>",
      compensationPackage: "Salary Grade 15, Step 2 (PHP 38,000/month) plus government benefits",
      compensationPackageHtml: "<p><strong>Salary Grade 15, Step 2</strong> (PHP 38,000/month)</p><ul><li>GSIS, PhilHealth, Pag-IBIG</li><li>13th Month Pay</li></ul>",
      otherQualifications: "Preferred: Master's degree; strong writing skills",
      otherQualificationsHtml: "<p>Preferred:</p><ul><li>Master's degree</li><li>Strong technical writing skills</li></ul>",
      numberOfVacancy: 2,
      publishDate: new Date(),
      deadlineDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      processingDate: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
      isActive: true,
    },
  });

  // ---- An application (Juan applied to job1, status UNDER_REVIEW → for evaluation) ----
  const profileSnapshot = JSON.stringify({
    firstName: applicant.firstName,
    lastName: applicant.lastName,
    emailAddress: applicant.emailAddress,
    contactNumber: applicant.contactNumber,
    gender: applicant.gender,
    civilStatus: applicant.civilStatus,
    citizenship: applicant.citizenship,
    presentAddress: applicant.presentAddress,
  });
  const eduSnapshot = JSON.stringify(
    await db.applicantEducation.findMany({ where: { applicantId: applicant.id } })
  );
  const expSnapshot = JSON.stringify(
    await db.applicantWorkExperience.findMany({ where: { applicantId: applicant.id } })
  );
  const trainSnapshot = JSON.stringify(
    await db.applicantTraining.findMany({ where: { applicantId: applicant.id } })
  );
  const eligSnapshot = JSON.stringify(
    await db.applicantEligibility.findMany({ where: { applicantId: applicant.id } })
  );

  const existingApp = await db.application.findFirst({
    where: { applicantId: applicant.id, jobId: job1.id },
  });
  if (!existingApp) {
    await db.application.create({
      data: {
        applicantId: applicant.id,
        jobId: job1.id,
        status: "FOR_EVALUATION",
        dateApplied: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        mqrResults: JSON.stringify({
          education: "Meets the requirements",
          eligibility: "Meets the requirements",
          workExperience: "Meets the requirements",
          training: "Meets the requirements",
        }),
        snapshotProfile: profileSnapshot,
        snapshotEducations: eduSnapshot,
        snapshotExperiences: expSnapshot,
        snapshotTrainings: trainSnapshot,
        snapshotEligibilities: eligSnapshot,
        snapshotAwards: JSON.stringify([]),
        snapshotDocuments: JSON.stringify([]),
      },
    });
  }

  // Ana applied to job2 (UNDER_REVIEW)
  const existingApp2 = await db.application.findFirst({
    where: { applicantId: applicant2.id, jobId: job2.id },
  });
  if (!existingApp2) {
    await db.application.create({
      data: {
        applicantId: applicant2.id,
        jobId: job2.id,
        status: "UNDER_REVIEW",
        dateApplied: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        mqrResults: JSON.stringify({
          education: "Meets the requirements",
          eligibility: "Meets the requirements",
          workExperience: "Meets the requirements",
          training: "Meets the requirements",
        }),
        snapshotProfile: JSON.stringify({
          firstName: applicant2.firstName,
          lastName: applicant2.lastName,
          emailAddress: applicant2.emailAddress,
        }),
        snapshotEducations: JSON.stringify(
          await db.applicantEducation.findMany({ where: { applicantId: applicant2.id } })
        ),
        snapshotExperiences: JSON.stringify(
          await db.applicantWorkExperience.findMany({ where: { applicantId: applicant2.id } })
        ),
        snapshotTrainings: JSON.stringify(
          await db.applicantTraining.findMany({ where: { applicantId: applicant2.id } })
        ),
        snapshotEligibilities: JSON.stringify(
          await db.applicantEligibility.findMany({ where: { applicantId: applicant2.id } })
        ),
        snapshotAwards: JSON.stringify([]),
        snapshotDocuments: JSON.stringify([]),
      },
    });
  }

  // ---- Eligibility reference data ----
  const eligibilities = [
    "Registered Metallurgical Engineer",
    "Civil Service Professional",
    "Civil Service Sub-Professional",
    "Registered Engineer",
    "Licensed Chemist",
    "LET - Professional",
  ];
  for (const name of eligibilities) {
    await db.eligibility.upsert({
      where: { name },
      update: {},
      create: { name, category: "Professional" },
    });
  }

  // ---- Course reference data ----
  const courses = [
    "BS Metallurgical Engineering",
    "BS Materials Engineering",
    "BS Mechanical Engineering",
    "BS Chemical Engineering",
    "BS Chemistry",
    "BS Industrial Engineering",
    "BS Computer Science",
    "MS Materials Engineering",
    "MS Metallurgical Engineering",
    "PhD Materials Science",
    "Others",
  ];
  for (const name of courses) {
    await db.course.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log("✅ Seed complete!");
  console.log("   Admin:     admin@rmis.dost.gov.ph / password123");
  console.log("   Evaluator: evaluator@rmis.dost.gov.ph / password123");
  console.log("   Applicant: juan.delacruz@example.com / password123");
  console.log("   Applicant: ana.reyes@example.com / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
