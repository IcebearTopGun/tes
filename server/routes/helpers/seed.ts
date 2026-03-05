import bcrypt from "bcryptjs";
import { sql as drizzleSql } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";

export async function initAdminUsers() {
  try {
    // Create table if not exists (raw SQL, safe to run multiple times)
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        employee_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        phone_number TEXT,
        profile_photo_url TEXT,
        role TEXT NOT NULL DEFAULT 'ADMIN',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    try {
      await db.execute(drizzleSql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT`);
    } catch {}
  } catch (err) {
    console.error("[initAdminUsers] Error:", err);
  }
}

export async function seedDatabase() {
  // Skip if already seeded (50 students + admin exist)
  const allStudents = await storage.getAllStudents();
  const existingAdmin = await storage.getAdminByEmployeeId("A001");
  if (allStudents.length >= 50 && existingAdmin) {
    console.log("[seed] Already seeded — skipping.");
    return;
  }

  console.log("[seed] Seeding school data (50 students, 5 teachers, 1 admin)...");

  // Wipe everything in FK-safe order
  await db.execute(drizzleSql`TRUNCATE TABLE homework_submissions, messages, deviation_logs, performance_profiles, evaluations, merged_answer_scripts, answer_sheet_pages, answer_sheets, ncert_chapters, conversations, homework, exams, admins RESTART IDENTITY CASCADE`);

  const hp = await bcrypt.hash("123", 10);

  // ── 1 ADMIN ─────────────────────────────────────────────────────────────────
  await storage.createAdmin({ employeeId: "A001", name: "Principal Admin", email: "admin@school.edu", password: hp });

  // ── SEED ADMIN USERS (ADMIN + PRINCIPAL) ─────────────────────────────────
  try {
    const existingAU = await storage.getAdminUserByEmployeeId("ADMIN001");
    if (!existingAU) {
      await storage.createAdminUser({ employeeId: "ADMIN001", name: "School Admin", email: "schooladmin@school.edu", passwordHash: hp, phoneNumber: "9000000001", role: "ADMIN" });
      await storage.createAdminUser({ employeeId: "PRIN001", name: "School Principal", email: "principal@school.edu", passwordHash: hp, phoneNumber: "9000000002", role: "PRINCIPAL" });
      console.log("[seed] Admin users seeded: ADMIN001/123 and PRIN001/123");
    }
  } catch (err) { console.error("[seed] Admin users seeding error:", err); }

  // ── EXAM DEFINITIONS ─────────────────────────────────────────────────────────
  const today = new Date();
  const daysFromNow = (n: number) => new Date(today.getTime() + n * 86400000).toISOString().split("T")[0];

  type ExamDef = {
    tIdx: number; subject: string; class_: string;
    name: string; marks: number; cat: string;
    q: string; ans: string; difficulty: number;
  };
  const examDefs: ExamDef[] = [
    { tIdx: 0, subject: "Mathematics", class_: "9",  name: "Mathematics Unit Test — Class 9",       marks: 50,  cat: "unit_test",  difficulty: 0.7,
      q: "Q1 (10m): Solve: 3x − 7 = 14.\nQ2 (15m): Find prime factorisation of 1260.\nQ3 (15m): In △ABC, AB=5, BC=12. Find AC.\nQ4 (10m): Evaluate: 4³ + √144.",
      ans: "Q1: x=7.\nQ2: 2²×3²×5×7.\nQ3: 13.\nQ4: 76." },
    { tIdx: 0, subject: "Mathematics", class_: "10", name: "Mathematics Unit Test — Class 10",      marks: 50,  cat: "unit_test",  difficulty: 0.72,
      q: "Q1 (10m): Factorize x²+5x+6.\nQ2 (15m): Solve x²−5x+6=0.\nQ3 (15m): Area of circle with r=7cm.\nQ4 (10m): Simplify (a+b)²−(a−b)².",
      ans: "Q1: (x+2)(x+3).\nQ2: x=2 or x=3.\nQ3: 154 cm².\nQ4: 4ab." },
    { tIdx: 1, subject: "Science",      class_: "9",  name: "Science Mid Term — Class 9",          marks: 100, cat: "mid_term",   difficulty: 0.65,
      q: "Q1 (20m): Define cell and list its parts.\nQ2 (20m): Explain photosynthesis.\nQ3 (20m): State Newton's Laws.\nQ4 (20m): Describe water cycle.\nQ5 (20m): Acids vs Bases.",
      ans: "Q1: Cell is basic unit of life. Parts: nucleus, cytoplasm, cell membrane.\nQ2: 6CO₂+6H₂O→C₆H₁₂O₆+6O₂.\nQ3: Inertia, F=ma, Action-Reaction.\nQ4: Evaporation→Condensation→Precipitation→Collection.\nQ5: Acids taste sour, turn litmus red; Bases taste bitter, turn litmus blue." },
    { tIdx: 1, subject: "Science",      class_: "10", name: "Science Mid Term — Class 10",         marks: 100, cat: "mid_term",   difficulty: 0.67,
      q: "Q1 (20m): Explain Ohm's Law.\nQ2 (20m): Describe photosynthesis.\nQ3 (20m): Explain periodic table trends.\nQ4 (20m): Describe carbon compounds.\nQ5 (20m): Explain reproduction in plants.",
      ans: "Q1: V=IR; defines relation between V, I, R.\nQ2: 6CO₂+6H₂O→C₆H₁₂O₆+6O₂.\nQ3: Trends in atomic size, valency, metallic character.\nQ4: Covalent bonding, homologous series, properties.\nQ5: Sexual/asexual reproduction, pollination." },
    { tIdx: 2, subject: "English",      class_: "9",  name: "English Unit Test — Class 9",        marks: 50,  cat: "unit_test",  difficulty: 0.5,
      q: "Q1 (15m): Write a paragraph on 'My School'.\nQ2 (15m): Grammar: Use of tenses.\nQ3 (20m): Letter writing.",
      ans: "Q1: Paragraph describing school.\nQ2: Present/Past/Future examples.\nQ3: Formal letter format." },
    { tIdx: 2, subject: "English",      class_: "10", name: "English Unit Test — Class 10",       marks: 50,  cat: "unit_test",  difficulty: 0.52,
      q: "Q1 (15m): Write a speech on 'Discipline'.\nQ2 (15m): Grammar: Active/Passive voice.\nQ3 (20m): Report writing.",
      ans: "Q1: Speech on discipline.\nQ2: Active/Passive examples.\nQ3: Report format." },
    { tIdx: 3, subject: "Social Science", class_: "9",  name: "SST Mid Term — Class 9",           marks: 100, cat: "mid_term",   difficulty: 0.6,
      q: "Q1 (20m): Explain French Revolution.\nQ2 (20m): Describe Indian Constitution.\nQ3 (20m): Explain monsoon in India.\nQ4 (20m): Explain democracy.\nQ5 (20m): Describe Nazism.",
      ans: "Q1: Causes and effects of French Revolution.\nQ2: Features of Constitution.\nQ3: Monsoon winds and rainfall.\nQ4: Key features of democracy.\nQ5: Nazi ideology and impact." },
    { tIdx: 3, subject: "Social Science", class_: "10", name: "SST Mid Term — Class 10",          marks: 100, cat: "mid_term",   difficulty: 0.62,
      q: "Q1 (20m): Explain World War II.\nQ2 (20m): Describe federalism in India.\nQ3 (20m): Explain development indicators.\nQ4 (20m): Explain globalisation.\nQ5 (20m): Describe political parties.",
      ans: "Q1: Causes and consequences of WWII.\nQ2: Centre-State division of powers; Concurrent, State and Union Lists.\nQ3: Primary, Secondary, Tertiary sectors contribute to GDP and employment.\nQ4: Globalisation and its impacts.\nQ5: Role of political parties." },
    { tIdx: 4, subject: "Hindi",        class_: "9",  name: "Hindi Unit Test — Class 9",           marks: 50,  cat: "unit_test", difficulty: 0.45,
      q: "Q1 (15m): किसी एक कहानी का सारांश लिखिए।\nQ2 (15m): व्याकरण: संधि विच्छेद।\nQ3 (20m): निबंध: पर्यावरण प्रदूषण।",
      ans: "Q1: कहानी का सारांश सटीक और सरल भाषा में।\nQ2: संधि विच्छेद के उदाहरण।\nQ3: प्रदूषण के कारण, प्रभाव और समाधान पर निबंध।" },
    { tIdx: 4, subject: "Hindi",        class_: "10", name: "Hindi Unit Test — Class 10",          marks: 50,  cat: "unit_test", difficulty: 0.47,
      q: "Q1 (15m): कबीर के दोहों की व्याख्या।\nQ2 (15m): व्याकरण: वाक्य-भेद।\nQ3 (20m): निबंध: आधुनिक जीवन में मोबाइल।",
      ans: "Q1: दोहों का अर्थ और संदर्भ।\nQ2: सरल, मिश्र, संयुक्त वाक्य के उदाहरण।\nQ3: मोबाइल के लाभ-हानि पर संतुलित निबंध।" },
  ];

  const teachers = [
    { name: "Anita Rao", employeeId: "T001", email: "anita@school.edu", phone: "9000000001", subjectsAssigned: "Mathematics", classesAssigned: "9,10", isClassTeacher: 1, classTeacherOf: "9-A" },
    { name: "Rahul Mehta", employeeId: "T002", email: "rahul@school.edu", phone: "9000000002", subjectsAssigned: "Science", classesAssigned: "9,10", isClassTeacher: 1, classTeacherOf: "10-A" },
    { name: "Meera Nair", employeeId: "T003", email: "meera@school.edu", phone: "9000000003", subjectsAssigned: "English", classesAssigned: "9,10", isClassTeacher: 0, classTeacherOf: null },
    { name: "Vikram Singh", employeeId: "T004", email: "vikram@school.edu", phone: "9000000004", subjectsAssigned: "Social Science", classesAssigned: "9,10", isClassTeacher: 0, classTeacherOf: null },
    { name: "Sunita Devi", employeeId: "T005", email: "sunita@school.edu", phone: "9000000005", subjectsAssigned: "Hindi", classesAssigned: "9,10", isClassTeacher: 0, classTeacherOf: null },
  ];

  for (const t of teachers) {
    await storage.createTeacher({
      employeeId: t.employeeId,
      name: t.name,
      email: t.email,
      phone: t.phone,
      subjectsAssigned: t.subjectsAssigned,
      classesAssigned: t.classesAssigned,
      isClassTeacher: t.isClassTeacher,
      classTeacherOf: t.classTeacherOf,
      password: hp,
      assignments: JSON.stringify([{ class: "9", section: "A", subjects: [t.subjectsAssigned] }, { class: "10", section: "A", subjects: [t.subjectsAssigned] }]),
    } as any);
  }

  const sections = ["A", "B", "C"];
  let studentCounter = 1;
  for (const cls of ["9", "10"]) {
    for (const sec of sections) {
      for (let i = 0; i < 8; i++) {
        const adm = `S${String(studentCounter).padStart(3, "0")}`;
        await storage.createStudent({
          admissionNumber: adm,
          name: `Student ${studentCounter}`,
          email: `student${studentCounter}@school.edu`,
          phone: `9000000${String(studentCounter).padStart(3, "0")}`,
          studentClass: cls,
          section: sec,
          password: hp,
        } as any);
        studentCounter++;
      }
    }
  }

  for (const def of examDefs) {
    const teacherId = def.tIdx + 1;
    const exam = await storage.createExam({
      teacherId,
      subject: def.subject,
      className: def.class_,
      examDate: daysFromNow(def.tIdx + 1),
      totalMarks: def.marks,
      questionText: def.q,
      modelAnswerText: def.ans,
      markingSchemeText: def.ans,
      examName: def.name,
      category: def.cat,
      difficulty: def.difficulty,
    } as any);

    // Create answer sheets + evaluations for random subset
    const students = await storage.getStudentsByClassAndSection(def.class_, "A");
    for (const s of students.slice(0, 5)) {
      const sheet = await storage.createAnswerSheet({
        examId: exam.id,
        admissionNumber: s.admissionNumber,
        studentName: s.name,
        answerText: "Sample answers...",
        fileBase64: null,
      });
      await storage.createEvaluation({
        answerSheetId: sheet.id,
        admissionNumber: s.admissionNumber,
        studentName: s.name,
        totalMarks: Math.round(def.marks * (0.4 + Math.random() * 0.6)),
        questions: JSON.stringify([
          { question_number: 1, marks_awarded: 10, max_marks: 10, chapter: "General", deviation_reason: "", improvement_suggestion: "" },
        ]),
        overallFeedback: "Good effort.",
      });
    }
  }

  // NCERT sample chapters
  const ncertChapters = [
    { teacherId: 1, classLevel: "9", subject: "Mathematics", chapterNumber: 1, chapterName: "Number Systems" },
    { teacherId: 1, classLevel: "9", subject: "Mathematics", chapterNumber: 2, chapterName: "Polynomials" },
    { teacherId: 2, classLevel: "9", subject: "Science", chapterNumber: 1, chapterName: "Matter in Our Surroundings" },
    { teacherId: 2, classLevel: "10", subject: "Science", chapterNumber: 1, chapterName: "Chemical Reactions" },
  ];
  for (const c of ncertChapters) {
    await storage.createNcertChapter({
      teacherId: c.teacherId,
      classLevel: c.classLevel,
      subject: c.subject,
      chapterNumber: c.chapterNumber,
      chapterName: c.chapterName,
    } as any);
  }

  console.log("[seed] Seeding complete.");
}

/*
File Purpose:
This file contains database seed and admin-user initialization helpers.

Responsibilities:

* Ensures the admin_users table exists and is up to date
* Seeds demo data for admins, teachers, students, exams, evaluations, and chapters

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
