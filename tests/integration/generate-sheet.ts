import { createCanvas } from "@napi-rs/canvas";

export interface AnswerSheetParams {
  studentName: string;
  admissionNo: string;
  answers: Array<{ qNum: number; text: string }>;
}

function wrapText(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number
): number {
  if (!text.trim()) {
    ctx.fillText("[No answer provided]", x, startY);
    return startY + lineHeight;
  }
  const words = text.split(" ");
  let line = "";
  let y = startY;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const { width } = ctx.measureText(testLine);
    if (width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

export function generateAnswerSheet(params: AnswerSheetParams): string {
  const { studentName, admissionNo, answers } = params;
  const W = 820;
  const H = 1300;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 3;
  ctx.strokeRect(15, 15, W - 30, H - 30);

  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("STUDENT ANSWER SHEET", W / 2, 65);

  ctx.textAlign = "left";
  ctx.font = "20px sans-serif";
  ctx.fillText(`Student Name:  ${studentName}`, 40, 110);
  ctx.fillText(`Admission No:  ${admissionNo}`, 40, 140);

  ctx.strokeStyle = "#888888";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, 160);
  ctx.lineTo(W - 30, 160);
  ctx.stroke();

  let y = 190;
  const maxW = W - 120;

  for (const { qNum, text } of answers) {
    ctx.fillStyle = "#000000";
    ctx.font = "bold 19px sans-serif";
    ctx.fillText(`Q${qNum}.`, 40, y);

    ctx.font = "18px sans-serif";
    y = wrapText(ctx, text, 70, y, maxW, 26);
    y += 14;

    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, y - 6);
    ctx.lineTo(W - 40, y - 6);
    ctx.stroke();
    y += 8;
  }

  const buf = canvas.toBuffer("image/png");
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export function generateModelAnswerSheet(answers: Array<{ qNum: number; marks: number; text: string }>): string {
  const W = 820;
  const H = 1300;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f9f9f9";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#003366";
  ctx.lineWidth = 4;
  ctx.strokeRect(15, 15, W - 30, H - 30);

  ctx.fillStyle = "#003366";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("MODEL ANSWER SHEET (TEACHER COPY)", W / 2, 60);

  ctx.textAlign = "left";
  ctx.font = "italic 18px sans-serif";
  ctx.fillStyle = "#555555";
  ctx.fillText("Each question: see marks below. Partial credit allowed.", 40, 95);

  ctx.strokeStyle = "#003366";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, 115);
  ctx.lineTo(W - 30, 115);
  ctx.stroke();

  let y = 140;
  const maxW = W - 120;

  for (const { qNum, marks, text } of answers) {
    ctx.fillStyle = "#003366";
    ctx.font = `bold 19px sans-serif`;
    ctx.fillText(`Q${qNum}  [${marks} marks]:`, 40, y);
    y += 28;

    ctx.fillStyle = "#1a1a1a";
    ctx.font = "18px sans-serif";
    y = wrapText(ctx, text, 60, y, maxW, 26);
    y += 18;

    ctx.strokeStyle = "#aaaaaa";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, y - 8);
    ctx.lineTo(W - 40, y - 8);
    ctx.stroke();
    y += 6;
  }

  const buf = canvas.toBuffer("image/png");
  return `data:image/png;base64,${buf.toString("base64")}`;
}
