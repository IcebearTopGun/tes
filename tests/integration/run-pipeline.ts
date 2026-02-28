/**
 * ScholarFlow Integration Test Suite
 * Tests the full pipeline: OCR extraction → Evaluation → DB storage → Chat
 *
 * Run with:  npx tsx tests/integration/run-pipeline.ts
 * Requires:  Server running at http://localhost:5000
 */

import { generateAnswerSheet, generateModelAnswerSheet } from "./generate-sheet";
import {
  loginTeacher,
  createExam,
  processAnswerSheet,
  evaluateSheet,
  createConversation,
  sendMessage,
} from "./api";

const PASS = "✓";
const FAIL = "✗";
const INFO = "→";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ` (${detail})` : ""}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(60)}`);
}

const MODEL_ANSWERS = [
  {
    qNum: 1,
    marks: 20,
    text: "Photosynthesis is the process by which plants use sunlight, carbon dioxide (CO2), and water (H2O) to produce glucose and oxygen. Chlorophyll in chloroplasts absorbs light energy for this reaction: 6CO2 + 6H2O + light → C6H12O6 + 6O2.",
  },
  {
    qNum: 2,
    marks: 20,
    text: "Newton's First Law of Motion (Law of Inertia): An object at rest remains at rest, and an object in motion continues in uniform motion in a straight line, unless acted upon by a net external force.",
  },
  {
    qNum: 3,
    marks: 20,
    text: "The Water Cycle: Water evaporates from oceans and lakes into the atmosphere, cools and condenses into clouds, falls as precipitation (rain/snow), and collects in rivers, lakes, and groundwater before evaporating again.",
  },
  {
    qNum: 4,
    marks: 20,
    text: "DNA (Deoxyribonucleic Acid) is the hereditary molecule found in cell nuclei. It consists of four nitrogenous bases — Adenine (A), Thymine (T), Guanine (G), Cytosine (C) — arranged in a double helix with a deoxyribose-phosphate backbone. A pairs with T, and G pairs with C.",
  },
  {
    qNum: 5,
    marks: 20,
    text: "The heart is a four-chambered muscular organ. It pumps oxygenated blood from the left ventricle through arteries to all body tissues, and receives deoxygenated blood via veins into the right atrium, sending it to the lungs for oxygenation via the pulmonary circuit.",
  },
];

const SCENARIOS = [
  {
    label: "Student A — Perfect (target ~100%)",
    student: { name: "Alice Johnson", admissionNo: "TEST-S100" },
    expectedMin: 88,
    expectedMax: 100,
    answers: [
      {
        qNum: 1,
        text: "Photosynthesis is the biological process where plants use sunlight, carbon dioxide, and water to produce glucose and oxygen. The equation is 6CO2 + 6H2O + light energy → C6H12O6 + 6O2. Chlorophyll in the chloroplasts absorbs the light.",
      },
      {
        qNum: 2,
        text: "Newton's First Law of Motion states that an object at rest remains at rest and an object in motion continues at constant velocity in a straight line unless acted upon by a net external force. This property is called inertia.",
      },
      {
        qNum: 3,
        text: "The water cycle involves four stages: evaporation (water turns to vapour from oceans), condensation (vapour cools into clouds), precipitation (rain or snow falls to earth), and collection (water gathers in rivers, lakes and groundwater). The sun drives evaporation.",
      },
      {
        qNum: 4,
        text: "DNA (Deoxyribonucleic acid) carries genetic information. It is made of four bases: Adenine, Thymine, Guanine, and Cytosine, forming a double helix. A pairs with T and G pairs with C. The backbone is made of deoxyribose sugar and phosphate groups.",
      },
      {
        qNum: 5,
        text: "The heart is a four-chambered muscular pump. The left ventricle pumps oxygenated blood through arteries to all body tissues. Deoxygenated blood returns through veins to the right atrium, then goes to the lungs via the pulmonary artery to pick up oxygen.",
      },
    ],
  },
  {
    label: "Student B — Near Perfect (target ~99%)",
    student: { name: "Bob Martinez", admissionNo: "TEST-S099" },
    expectedMin: 85,
    expectedMax: 100,
    answers: [
      {
        qNum: 1,
        text: "Photosynthesis is how plants make food using sunlight, carbon dioxide, and water. The products are glucose and oxygen. Chlorophyll absorbs the light energy needed for this process.",
      },
      {
        qNum: 2,
        text: "Newton's First Law: Objects stay at rest or keep moving in a straight line at constant speed unless a net external force acts on them. This is the law of inertia.",
      },
      {
        qNum: 3,
        text: "The water cycle: evaporation takes water from oceans into the atmosphere, it condenses into clouds, precipitation brings it back as rain or snow, and it collects in lakes and rivers.",
      },
      {
        qNum: 4,
        text: "DNA (Deoxyribonucleic acid) stores genetic information using four bases: A, T, G, C in a double helix structure. A pairs with T, G pairs with C. It has a sugar-phosphate backbone.",
      },
      {
        qNum: 5,
        text: "The heart pumps oxygenated blood through arteries to the body and receives deoxygenated blood through veins.",
      },
    ],
  },
  {
    label: "Student C — Average (target ~78%)",
    student: { name: "Carol Chen", admissionNo: "TEST-S078" },
    expectedMin: 60,
    expectedMax: 88,
    answers: [
      {
        qNum: 1,
        text: "Photosynthesis is how plants make food from sunlight. Plants take in CO2 and release oxygen.",
      },
      {
        qNum: 2,
        text: "Newton's first law says that things keep moving or stay still unless a force acts on them.",
      },
      {
        qNum: 3,
        text: "The water cycle: water evaporates from oceans, forms clouds and falls back as rain.",
      },
      {
        qNum: 4,
        text: "DNA contains four bases and forms a double helix. It carries genetic information in cells.",
      },
      {
        qNum: 5,
        text: "The heart pumps blood around the body.",
      },
    ],
  },
  {
    label: "Student D — Below Average (target ~50%)",
    student: { name: "Dave Wilson", admissionNo: "TEST-S050" },
    expectedMin: 25,
    expectedMax: 65,
    answers: [
      {
        qNum: 1,
        text: "Plants use sunlight to make food. This is called photosynthesis.",
      },
      {
        qNum: 2,
        text: "Moving things keep moving.",
      },
      {
        qNum: 3,
        text: "Water goes up and comes down as rain.",
      },
      {
        qNum: 4,
        text: "",
      },
      {
        qNum: 5,
        text: "",
      },
    ],
  },
];

interface ScenarioResult {
  label: string;
  student: string;
  admissionNo: string;
  sheetId: number;
  ocrStudentName: string;
  ocrAdmissionNo: string;
  ocrAnswerCount: number;
  totalMarks: number;
  pct: number;
  withinRange: boolean;
  evalId: number;
}

async function runScenario(
  scenario: (typeof SCENARIOS)[0],
  examId: number
): Promise<ScenarioResult> {
  console.log(`\n  ${INFO} ${scenario.label}`);
  console.log(`    Generating answer sheet image...`);

  const imageBase64 = generateAnswerSheet({
    studentName: scenario.student.name,
    admissionNo: scenario.student.admissionNo,
    answers: scenario.answers,
  });
  console.log(`    Image size: ${Math.round(imageBase64.length / 1024)}KB`);

  console.log(`    Sending to OCR endpoint...`);
  const ocrResult = await processAnswerSheet(examId, imageBase64);
  console.log(`    OCR → student: "${ocrResult.student_name}", admission: "${ocrResult.admission_number}", answers: ${ocrResult.answers?.length ?? 0}`);

  console.log(`    Running AI evaluation...`);
  const evalResult = await evaluateSheet(ocrResult.id);
  const totalMarks = evalResult.totalMarks ?? evalResult.total_marks ?? 0;
  const pct = Math.round((totalMarks / 100) * 100);
  console.log(`    Score: ${totalMarks}/100 (${pct}%) — expected ${scenario.expectedMin}–${scenario.expectedMax}%`);

  return {
    label: scenario.label,
    student: scenario.student.name,
    admissionNo: scenario.student.admissionNo,
    sheetId: ocrResult.id,
    ocrStudentName: ocrResult.student_name ?? "",
    ocrAdmissionNo: ocrResult.admission_number ?? "",
    ocrAnswerCount: ocrResult.answers?.length ?? 0,
    totalMarks,
    pct,
    withinRange: pct >= scenario.expectedMin && pct <= scenario.expectedMax,
    evalId: evalResult.id,
  };
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║       ScholarFlow Integration Test Suite                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  section("1. Authentication");
  let token: string;
  try {
    token = await loginTeacher("T001", "password123");
    assert(!!token, "Teacher login succeeds", `token: ${token.slice(0, 20)}...`);
  } catch (e: any) {
    assert(false, "Teacher login", e.message);
    console.log("\n  Server may not be running. Start with: npm run dev");
    process.exit(1);
  }

  section("2. Exam Setup");
  const modelAnswerImage = generateModelAnswerSheet(MODEL_ANSWERS);
  console.log(`  ${INFO} Generated model answer image (${Math.round(modelAnswerImage.length / 1024)}KB)`);

  let examId: number;
  try {
    const exam = await createExam({
      examName: "Integration Test — Science Assessment",
      subject: "Science",
      totalMarks: 100,
      modelAnswerUrl: modelAnswerImage,
      markingSchemeUrl: modelAnswerImage,
    });
    examId = exam.id;
    assert(typeof examId === "number" && examId > 0, `Exam created (id=${examId})`);
  } catch (e: any) {
    assert(false, "Create exam", e.message);
    process.exit(1);
  }

  section("3. OCR + Evaluation Pipeline — Four Scoring Scenarios");
  const results: ScenarioResult[] = [];

  for (const scenario of SCENARIOS) {
    try {
      const r = await runScenario(scenario, examId);
      results.push(r);
    } catch (e: any) {
      console.log(`  ${FAIL} ${scenario.label} — ERROR: ${e.message}`);
      failed++;
    }
  }

  section("4. Validation — Per-Scenario Assertions");
  for (const [i, r] of results.entries()) {
    const s = SCENARIOS[i];
    console.log(`\n  [${r.label}]`);
    assert(r.ocrStudentName.length > 0, "OCR extracted student name", `got: "${r.ocrStudentName}"`);
    assert(r.ocrAdmissionNo.length > 0, "OCR extracted admission number", `got: "${r.ocrAdmissionNo}"`);
    assert(r.ocrAnswerCount >= 1, `OCR extracted answers (got ${r.ocrAnswerCount})`);
    assert(typeof r.totalMarks === "number", `Evaluation returned numeric marks (${r.totalMarks})`);
    assert(r.evalId > 0, `Evaluation stored in DB (id=${r.evalId})`);
    assert(r.withinRange, `Score in expected range ${s.expectedMin}–${s.expectedMax}% (got ${r.pct}%)`);
  }

  if (results.length >= 2) {
    section("5. Relative Scoring Validation");
    const sorted = [...results].sort((a, b) => b.totalMarks - a.totalMarks);
    const scores = results.map((r) => r.totalMarks);
    console.log(`  Scores: ${scores.join(", ")}`);
    assert(
      scores[0] > scores[2],
      `100% student (${scores[0]}) outscores 78% student (${scores[2]})`
    );
    if (scores.length === 4) {
      assert(
        scores[1] > scores[3],
        `99% student (${scores[1]}) outscores 50% student (${scores[3]})`
      );
      assert(
        scores[2] > scores[3],
        `78% student (${scores[2]}) outscores 50% student (${scores[3]})`
      );
    }
    assert(
      sorted[0].totalMarks >= sorted[sorted.length - 1].totalMarks,
      "Scoring is monotonically ordered top-to-bottom"
    );
  }

  section("6. Conversational AI Endpoint");
  try {
    const conv = await createConversation("Test Analysis Session");
    assert(conv.id > 0, `Conversation created (id=${conv.id})`);

    const msg = await sendMessage(conv.id, "Which student scored highest in the test?");
    assert(typeof msg.content === "string" && msg.content.length > 0, "AI responded to question");
    assert(msg.role === "assistant", "Response has role=assistant");
    console.log(`  ${INFO} AI response preview: "${msg.content.slice(0, 120)}..."`);
  } catch (e: any) {
    assert(false, "Conversational AI endpoint", e.message);
  }

  section("7. Summary");
  console.log("\n  ┌─────────────────────────────────────────────┐");
  console.log("  │ Scenario               │ Score │ In Range? │");
  console.log("  ├─────────────────────────────────────────────┤");
  for (const r of results) {
    const label = r.label.padEnd(22).slice(0, 22);
    const score = `${r.totalMarks}/100`.padEnd(7);
    const ok = r.withinRange ? " YES  " : "  NO  ";
    console.log(`  │ ${label} │ ${score} │    ${ok}  │`);
  }
  console.log("  └─────────────────────────────────────────────┘");
  console.log(`\n  Tests passed: ${passed}`);
  console.log(`  Tests failed: ${failed}`);
  console.log(
    `\n  ${failed === 0 ? "ALL TESTS PASSED" : `${failed} TEST(S) FAILED`}\n`
  );

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
