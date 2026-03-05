const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9]{10,15}$/;
const ADMISSION_RE = /^[A-Za-z0-9._/-]{2,32}$/;
const CLASS_RE = /^[0-9]{1,2}$/;
const SECTION_RE = /^[A-Z]$/;

function normalizeClass(value: unknown): string {
  return String(value ?? ).trim();
}

function normalizeSection(value: unknown): string {
  return String(value ?? ).trim().toUpperCase();
}

export function validateStudentPayload(payload: any, opts: { partial?: boolean; requireContact?: boolean } = {}) {
  const partial = !!opts.partial;
  const requireContact = opts.requireContact !== false;
  const errs: string[] = [];
  const name = String(payload?.name ?? payload?.studentName ?? ).trim();
  const admissionNumber = String(payload?.admissionNumber ?? ).trim();
  const phone = String(payload?.phone ?? payload?.phoneNumber ?? ).trim();
  const email = String(payload?.email ?? ).trim();
  const studentClass = normalizeClass(payload?.studentClass ?? payload?.class);
  const section = normalizeSection(payload?.section);

  if (!partial || name in payload || studentName in payload) {
    if (!name || name.length < 2) errs.push(Valid