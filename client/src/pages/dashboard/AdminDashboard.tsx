import "@/dashboard.css";
import "@/pages/dashboard/dashboard-modular.css";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, TrendingUp, Plus, ChevronDown, BarChart2, GraduationCap, BookMarked, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { fetchWithAuth } from "@/lib/fetcher";
import ProfileDrawer from "@/components/ProfileDrawer";
import CustomInsights from "@/components/CustomInsights";
import { getInitials } from "@/shared/utils/identity";
import { ADMIN_CHAT_QUESTIONS, BAR_COLORS, CHART_PALETTE } from "./admin/constants";
import type { ClassRecord, StudentRecord, SubjectRecord, TeacherRecord } from "./admin/types";
import { getGreeting, kpiColor } from "./admin/utils";

// ─── Dropdown menu item — full-area click + hover ─────────────────────────────
function DropdownItem({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "10px 16px",
        textAlign: "left",
        background: hovered
          ? danger
            ? "rgba(201,60,60,0.09)"
            : "rgba(26,26,46,0.06)"
          : "transparent",
        border: "none",
        borderBottom: "1px solid rgba(26,26,46,0.06)",
        cursor: "pointer",
        fontSize: 13,
        color: danger ? "#c93c3c" : "var(--ink)",
        fontFamily: "inherit",
        transition: "background 0.13s",
        boxSizing: "border-box",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {children}
    </button>
  );
}

// ─── Excel validation ─────────────────────────────────────────────────────────
const EXCEL_SCHEMAS: Record<string, { col: string; required: boolean; type?: "number" | "letter" }[]> = {
  classSection: [
    { col: "class",    required: true,  type: "number" },
    { col: "section",  required: true,  type: "letter" },
    { col: "subjects", required: true  },
  ],
  mgdStudent: [
    { col: "studentName",     required: true  },
    { col: "phoneNumber",     required: false },
    { col: "email",           required: false },
    { col: "admissionNumber", required: true  },
    { col: "class",           required: true, type: "number" },
    { col: "section",         required: true, type: "letter" },
  ],
  mgdTeacher: [
    { col: "teacherName", required: true  },
    { col: "employeeId",  required: true  },
    { col: "email",       required: false },
    { col: "phoneNumber", required: false },
    { col: "assignmentsJson", required: false },
    { col: "assignments", required: false },
    { col: "class",       required: false, type: "number" },
    { col: "section",     required: false, type: "letter" },
    { col: "subjects",    required: false  },
    { col: "isClassTeacher", required: false },
    { col: "classTeacherOf", required: false },
    { col: "classTeacherOfClass", required: false },
    { col: "classTeacherOfSection", required: false },
    { col: "classTeacherClass", required: false },
    { col: "classTeacherSection", required: false },
  ],
};

function validateExcelRows(rows: any[], type: string): string[] {
  const schema = EXCEL_SCHEMAS[type];
  if (!schema) return [];
  const errors: string[] = [];

  const requiredCols = schema.filter(s => s.required).map(s => s.col);
  const presentHeaders = Object.keys(rows[0] || {});
  const missing = requiredCols.filter(c => !presentHeaders.some(h => h.toLowerCase() === c.toLowerCase()));
  if (missing.length) {
    errors.push(`Missing required column(s): ${missing.map(m => `"${m}"`).join(", ")}. Please use the downloaded template.`);
    return errors;
  }

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    schema.forEach(({ col, required, type: colType }) => {
      const key = presentHeaders.find(h => h.toLowerCase() === col.toLowerCase());
      const val = key ? (row[key] ?? "").toString().trim() : "";
      if (required && !val) {
        errors.push(`Row ${rowNum}: "${col}" is empty — this field is required.`);
        return;
      }
      if (val && colType === "number" && isNaN(Number(val))) {
        errors.push(`Row ${rowNum}: "${col}" must be a number (got "${val}").`);
      }
      if (val && colType === "letter" && !/^[A-Za-z]$/.test(val)) {
        errors.push(`Row ${rowNum}: "${col}" must be a single letter A–Z (got "${val}").`);
      }
    });

    if (type === "mgdTeacher") {
      const getVal = (name: string) => {
        const key = presentHeaders.find(h => h.toLowerCase() === name.toLowerCase());
        return key ? (row[key] ?? "").toString().trim() : "";
      };
      const assignmentsJson = getVal("assignmentsJson");
      const assignments = getVal("assignments");
      const cls = getVal("class");
      const sec = getVal("section");
      const subs = getVal("subjects");
      if (!assignmentsJson && !assignments && !(cls && sec && subs)) {
        errors.push(`Row ${rowNum}: provide "assignmentsJson" (preferred) or "assignments" or "class"+"section"+"subjects".`);
      }
      if (assignmentsJson) {
        try {
          const parsed = JSON.parse(assignmentsJson);
          if (!Array.isArray(parsed) || parsed.length === 0) {
            errors.push(`Row ${rowNum}: "assignmentsJson" must be a non-empty JSON array.`);
          }
        } catch {
          errors.push(`Row ${rowNum}: "assignmentsJson" must be valid JSON.`);
        }
      }
    }
  });
  return errors;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out.map(v => v.replace(/^"|"$/g, ""));
}

// ─── InlineDropdown — absolute positioned, attached to scroll flow ────────────
function InlineDropdown({ menuId, bulkDotMenu, setBulkDotMenu, children }: {
  menuId: number;
  bulkDotMenu: number | null;
  setBulkDotMenu: (id: number | null) => void;
  children: React.ReactNode;
}) {
  const isOpen = bulkDotMenu === menuId;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={e => { e.stopPropagation(); setBulkDotMenu(isOpen ? null : menuId); }}
        style={{
          width: 34, height: 34, borderRadius: 8,
          border: `1px solid ${isOpen ? "var(--ink)" : "var(--rule)"}`,
          background: isOpen ? "var(--lav-card)" : "var(--pane)",
          cursor: "pointer", fontSize: 18,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.15s, border-color 0.15s",
          position: "relative", zIndex: isOpen ? 10001 : 1,
        }}
        onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = "var(--lav-card)"; }}
        onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = "var(--pane)"; }}
      >⋮</button>
      {isOpen && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 4px)",
          background: "white", border: "1px solid var(--rule)",
          borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
          zIndex: 10000, minWidth: 160,
          overflow: "visible",
        }}>
          {children}
        </div>
      )}
    </div>
  );
}


function MiniBarChart({ data, emptyMsg }: { data: { label: string; value: number; color?: string }[]; emptyMsg?: string; }) {
  const max = Math.max(...data.map(d => d.value), 1);
  if (!data.length) return <div style={{ textAlign: "center", padding: "28px 0", color: "var(--mid)", fontSize: 13 }}>{emptyMsg ?? "No data yet"}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map((d, i) => (
        <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 108, fontSize: 11, fontWeight: 600, color: "var(--mid)", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }} title={d.label}>{d.label}</div>
          <div style={{ flex: 1, height: 22, background: "rgba(26,26,46,0.06)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.max(6, (d.value / max) * 100)}%`, background: d.color ?? CHART_PALETTE[i % CHART_PALETTE.length], borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 8, fontSize: 11, fontWeight: 700, color: "white", transition: "width 0.5s ease", minWidth: 28 }}>{d.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Donut chart ──────────────────────────────────────────────────────────────
function DonutChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  const r = 44;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const segments = slices.map(s => {
    const dash = (s.value / total) * circ;
    const seg = { ...s, dash, offset };
    offset += dash;
    return seg;
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={106} height={106} viewBox="0 0 106 106">
        {segments.map((seg, i) => (
          <circle key={i} cx={53} cy={53} r={r} fill="none" stroke={seg.color} strokeWidth={16}
            strokeDasharray={`${seg.dash} ${circ - seg.dash}`}
            strokeDashoffset={-seg.offset}
            style={{ transform: "rotate(-90deg)", transformOrigin: "53px 53px" }}
          />
        ))}
        <text x={53} y={57} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--ink)">{total}</text>
        <text x={53} y={69} textAnchor="middle" fontSize={9} fill="var(--mid)">total</text>
      </svg>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5, minWidth: 120 }}>
        {segments.map(seg => (
          <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
            <span style={{ color: "var(--mid)", flex: 1 }}>{seg.label}</span>
            <span style={{ fontWeight: 700, color: "var(--ink)" }}>{seg.value} ({Math.round((seg.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState("overview"); // FIX #7 — default
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [showAvaMenu, setShowAvaMenu] = useState(false);
  const [expandedEWStudent, setExpandedEWStudent] = useState<string | null>(null);
  const [expandedQQItem, setExpandedQQItem] = useState<number | null>(null);
  const [moreInsightsOpen, setMoreInsightsOpen] = useState(false);
  const [classFilter, setClassFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");

  const [showAddClassSection, setShowAddClassSection] = useState(false);
  const [editingClassSection, setEditingClassSection] = useState<any>(null);
  const [classSectionForm, setClassSectionForm] = useState({ className: "", section: "", subjects: [] as string[] });
  const [classSectionErrors, setClassSectionErrors] = useState<any>({});

  const [showAddMgdStudent, setShowAddMgdStudent] = useState(false);
  const [editingMgdStudent, setEditingMgdStudent] = useState<any>(null);
  const [mgdStudentForm, setMgdStudentForm] = useState({ studentName: "", phoneNumber: "", email: "", admissionNumber: "", class: "", section: "" });
  const [mgdStudentErrors, setMgdStudentErrors] = useState<any>({});

  const [showAddMgdTeacher, setShowAddMgdTeacher] = useState(false);
  const [editingMgdTeacher, setEditingMgdTeacher] = useState<any>(null);
  const [mgdTeacherForm, setMgdTeacherForm] = useState({ teacherName: "", employeeId: "", email: "", phoneNumber: "", assignments: [] as any[], isClassTeacher: false, classTeacherOf: "" });
  const [mgdTeacherErrors, setMgdTeacherErrors] = useState<any>({});
  const [teacherAssignClass, setTeacherAssignClass] = useState("");
  const [teacherAssignSection, setTeacherAssignSection] = useState("");
  const [teacherAssignSubjects, setTeacherAssignSubjects] = useState<string[]>([]);

  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: number; extra?: any } | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const [bulkUploadType, setBulkUploadType] = useState<string | null>(null);
  const [bulkUploadResult, setBulkUploadResult] = useState<{ created: number; duplicates: string[] } | null>(null);
  const [bulkUploadErrors, setBulkUploadErrors] = useState<string[]>([]);
  const [bulkDotMenu, setBulkDotMenu] = useState<number | null>(null);

  useEffect(() => {
    if (!bulkUploadResult) return;
    const timer = setTimeout(() => setBulkUploadResult(null), 2000);
    return () => clearTimeout(timer);
  }, [bulkUploadResult]);

  // ── New state for Student tab hierarchy and search ──
  const [studentSearch, setStudentSearch] = useState("");
  const [expandedStudentClass, setExpandedStudentClass] = useState<Set<string>>(new Set());
  const [expandedStudentSection, setExpandedStudentSection] = useState<Set<string>>(new Set());
  // ── Teacher search ──
  const [teacherSearch, setTeacherSearch] = useState("");
  // ── Class & Subjects expandable ──
  const [expandedClass, setExpandedClass] = useState<Set<string>>(new Set());

  // legacy
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherRecord | null>(null);
  const [teacherForm, setTeacherForm] = useState({ employeeId: "", name: "", phone: "" });
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [studentForm, setStudentForm] = useState({ admissionNumber: "", name: "", phone: "", studentClass: "9", section: "A" });
  const [showAddClass, setShowAddClass] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [classForm, setClassForm] = useState({ name: "", section: "", description: "", classTeacherId: "" });
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectRecord | null>(null);
  const [subjectForm, setSubjectForm] = useState({ name: "", code: "", description: "", className: "", section: "", teacherId: "" });
  const [teacherErrors, setTeacherErrors] = useState<Record<string, string>>({});
  const [studentErrors, setStudentErrors] = useState<Record<string, string>>({});
  const [classErrors, setClassErrors] = useState<Record<string, string>>({});
  const [subjectErrors, setSubjectErrors] = useState<Record<string, string>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const avaRef = useRef<HTMLDivElement>(null);

  // ── Queries ──
  const { data: kpis, isLoading: kpisLoading } = useQuery<any>({ queryKey: ["/api/admin/kpis"], queryFn: () => fetchWithAuth("/api/admin/kpis").then(r => r.json()), staleTime: 60000 });
  const { data: analytics } = useQuery<any>({ queryKey: ["/api/admin/analytics"], queryFn: () => fetchWithAuth("/api/admin/analytics").then(r => r.json()), staleTime: 60000 });
  const { data: stats } = useQuery<any>({ queryKey: ["/api/admin/stats"], queryFn: () => fetchWithAuth("/api/admin/stats").then(r => r.json()), staleTime: 60000 });
  const { data: studentList } = useQuery<StudentRecord[]>({ queryKey: ["/api/admin/students"], queryFn: () => fetchWithAuth("/api/admin/students").then(r => r.json()), enabled: activeSection === "students", staleTime: 60000 });
  const { data: teacherList } = useQuery<TeacherRecord[]>({ queryKey: ["/api/admin/teachers"], queryFn: () => fetchWithAuth("/api/admin/teachers").then(r => r.json()), staleTime: 60000 });
  const { data: adminEW, isLoading: adminEWLoading } = useQuery<any[]>({ queryKey: ["/api/admin/early-warning"], queryFn: () => fetchWithAuth("/api/admin/early-warning").then(r => r.json()), enabled: activeSection === "early-warning", staleTime: 60000 });
  const { data: adminQQ } = useQuery<any[]>({ queryKey: ["/api/admin/question-quality"], queryFn: () => fetchWithAuth("/api/admin/question-quality").then(r => r.json()), enabled: activeSection === "question-quality", staleTime: 60000 });
  const { data: classSectionList, isLoading: classSectionsLoading } = useQuery<any[]>({ queryKey: ["/api/admin/class-sections"], queryFn: () => fetchWithAuth("/api/admin/class-sections").then(r => r.json()) });
  const { data: mgdStudentList, isLoading: mgdStudentsLoading } = useQuery<any[]>({ queryKey: ["/api/admin/managed-students"], queryFn: () => fetchWithAuth("/api/admin/managed-students").then(r => r.json()) });
  const { data: mgdTeacherList, isLoading: mgdTeachersLoading } = useQuery<any[]>({ queryKey: ["/api/admin/managed-teachers"], queryFn: () => fetchWithAuth("/api/admin/managed-teachers").then(r => r.json()) });

  // ── Legacy mutations ──
  const addTeacherMut = useMutation({ mutationFn: async (data: any) => { const r = await fetchWithAuth("/api/admin/teachers", { method: "POST", body: JSON.stringify(data) }); const json = await r.json(); if (!r.ok) throw new Error(json.message || "Failed"); return json; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] }); setShowAddTeacher(false); setTeacherErrors({}); }, onError: (err: any) => { setTeacherErrors({ employeeId: err.message }); } });
  const updateTeacherMut = useMutation({ mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/teachers/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] }); setEditingTeacher(null); } });
  const deleteTeacherMut = useMutation({ mutationFn: (id: number) => fetchWithAuth(`/api/admin/teachers/${id}`, { method: "DELETE" }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] }); } });
  const addStudentMut = useMutation({ mutationFn: async (data: any) => { const r = await fetchWithAuth("/api/admin/students", { method: "POST", body: JSON.stringify(data) }); const json = await r.json(); if (!r.ok) throw new Error(json.message || "Failed"); return json; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] }); setShowAddStudent(false); setStudentErrors({}); }, onError: (err: any) => { setStudentErrors({ admissionNumber: err.message }); } });
  const updateStudentMut = useMutation({ mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/students/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] }); setEditingStudent(null); } });
  const deleteStudentMut = useMutation({ mutationFn: (id: number) => fetchWithAuth(`/api/admin/students/${id}`, { method: "DELETE" }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] }); } });
  const addClassMut = useMutation({ mutationFn: async (data: any) => { const r = await fetchWithAuth("/api/admin/classes", { method: "POST", body: JSON.stringify(data) }); const json = await r.json(); if (!r.ok) throw new Error(json.message || "Failed"); return json; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/classes"] }); setShowAddClass(false); setClassErrors({}); }, onError: (err: any) => { setClassErrors({ section: err.message }); } });
  const updateClassMut = useMutation({ mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/classes/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/classes"] }); setEditingClass(null); } });
  const deleteClassMut = useMutation({ mutationFn: (id: number) => fetchWithAuth(`/api/admin/classes/${id}`, { method: "DELETE" }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/classes"] }); } });
  const addSubjectMut = useMutation({ mutationFn: async (data: any) => { const r = await fetchWithAuth("/api/admin/subjects", { method: "POST", body: JSON.stringify(data) }); const json = await r.json(); if (!r.ok) throw new Error(json.message || "Failed"); return json; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/subjects"] }); setShowAddSubject(false); setSubjectErrors({}); }, onError: (err: any) => { setSubjectErrors({ name: err.message }); } });
  const updateSubjectMut = useMutation({ mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/subjects/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/subjects"] }); setEditingSubject(null); } });
  const deleteSubjectMut = useMutation({ mutationFn: (id: number) => fetchWithAuth(`/api/admin/subjects/${id}`, { method: "DELETE" }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/subjects"] }); } });

  // ── Managed-table mutations ──
  const addClassSectionMut = useMutation({ mutationFn: (data: any) => fetchWithAuth("/api/admin/class-sections", { method: "POST", body: JSON.stringify(data) }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/class-sections"] }); setShowAddClassSection(false); setEditingClassSection(null); } });
  const updateClassSectionMut = useMutation({ mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/class-sections/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/class-sections"] }); setEditingClassSection(null); setShowAddClassSection(false); setClassSectionForm({ className: "", section: "", subjects: [] }); } });
  const deleteClassSectionMut = useMutation({ mutationFn: ({ id, password, deleteSubject }: any) => fetchWithAuth(`/api/admin/class-sections/${id}`, { method: "DELETE", body: JSON.stringify({ password, deleteSubject }) }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/class-sections"] }); setDeleteConfirm(null); setDeletePassword(""); }, onError: () => { setDeleteError("Incorrect password or operation failed"); } });
  const bulkUploadClassSectionsMut = useMutation({
    mutationFn: async (records: any[]) => {
      const r = await fetchWithAuth("/api/admin/class-sections/bulk-upload", { method: "POST", body: JSON.stringify({ records }) });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.message || "Bulk upload failed");
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/class-sections"] });
      setBulkUploadResult(data);
      setBulkUploadErrors(data?.errors || []);
    },
    onError: (err: any) => {
      setBulkUploadResult(null);
      setBulkUploadErrors([err?.message || "Bulk upload failed"]);
    }
  });
  const addMgdStudentMut = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetchWithAuth("/api/admin/managed-students", { method: "POST", body: JSON.stringify(data) });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.message || "Failed to create student");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-students"] });
      setShowAddMgdStudent(false);
      setEditingMgdStudent(null);
      setMgdStudentErrors({});
    },
    onError: (err: any) => {
      setMgdStudentErrors((prev: any) => ({ ...prev, _form: err?.message || "Failed to create student" }));
    }
  });
  const updateMgdStudentMut = useMutation({ mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/managed-students/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-students"] }); setEditingMgdStudent(null); setShowAddMgdStudent(false); } });
  const deleteMgdStudentMut = useMutation({ mutationFn: ({ id, password }: any) => fetchWithAuth(`/api/admin/managed-students/${id}`, { method: "DELETE", body: JSON.stringify({ password }) }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-students"] }); setDeleteConfirm(null); setDeletePassword(""); }, onError: () => { setDeleteError("Incorrect password or operation failed"); } });
  const bulkUploadMgdStudentsMut = useMutation({
    mutationFn: async (records: any[]) => {
      const r = await fetchWithAuth("/api/admin/managed-students/bulk-upload", { method: "POST", body: JSON.stringify({ records }) });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.message || "Bulk upload failed");
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/class-sections"] });
      setBulkUploadResult(data);
      setBulkUploadErrors(data?.errors || []);
    },
    onError: (err: any) => {
      setBulkUploadResult(null);
      setBulkUploadErrors([err?.message || "Bulk upload failed"]);
    }
  });
  const addMgdTeacherMut = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetchWithAuth("/api/admin/managed-teachers", { method: "POST", body: JSON.stringify(data) });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.message || "Failed to create teacher");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-teachers"] });
      setShowAddMgdTeacher(false);
      setEditingMgdTeacher(null);
      setMgdTeacherErrors({});
    },
    onError: (err: any) => {
      setMgdTeacherErrors((prev: any) => ({ ...prev, _form: err?.message || "Failed to create teacher" }));
    }
  });
  const updateMgdTeacherMut = useMutation({ mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/managed-teachers/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-teachers"] }); setEditingMgdTeacher(null); setShowAddMgdTeacher(false); } });
  const deleteMgdTeacherMut = useMutation({ mutationFn: ({ id, password, deleteSubjectOnly, className, section, subject }: any) => fetchWithAuth(`/api/admin/managed-teachers/${id}`, { method: "DELETE", body: JSON.stringify({ password, deleteSubjectOnly, className, section, subject }) }).then(r => r.json()), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-teachers"] }); setDeleteConfirm(null); setDeletePassword(""); }, onError: () => { setDeleteError("Incorrect password or operation failed"); } });
  const bulkUploadMgdTeachersMut = useMutation({
    mutationFn: async (records: any[]) => {
      const r = await fetchWithAuth("/api/admin/managed-teachers/bulk-upload", { method: "POST", body: JSON.stringify({ records }) });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.message || "Bulk upload failed");
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-teachers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/class-sections"] });
      setBulkUploadResult(data);
      setBulkUploadErrors(data?.errors || []);
    },
    onError: (err: any) => {
      setBulkUploadResult(null);
      setBulkUploadErrors([err?.message || "Bulk upload failed"]);
    }
  });

  // ── Delete handler ──
  const handleDeleteConfirm = () => {
    if (!deleteConfirm || !deletePassword) { setDeleteError("Password required"); return; }
    setDeleteError("");
    const { type, id, extra } = deleteConfirm;
    if (type === "classSection") deleteClassSectionMut.mutate({ id, password: deletePassword, deleteSubject: extra?.deleteSubject });
    else if (type === "mgdStudent") deleteMgdStudentMut.mutate({ id, password: deletePassword });
    else if (type === "mgdTeacher") deleteMgdTeacherMut.mutate({ id, password: deletePassword, ...(extra || {}) });
  };

  const availableStudentClasses = [...new Set((classSectionList || []).map((c: any) => String(c.className)))].sort((a, b) => Number(a) - Number(b));
  const availableSectionsForStudentClass = (cls: string) =>
    [...new Set((classSectionList || []).filter((c: any) => String(c.className) === String(cls)).map((c: any) => c.section))].sort();

  const validateMgdStudentForm = (editingId?: number) => {
    const errs: Record<string, string> = {};
    if (!mgdStudentForm.studentName.trim()) errs.studentName = "Name required";
    if (!/^[0-9]{10}$/.test(mgdStudentForm.phoneNumber.trim())) errs.phoneNumber = "Phone must be exactly 10 digits";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mgdStudentForm.email.trim())) errs.email = "Valid email required";
    if (!/^[A-Za-z0-9._/-]{2,32}$/.test(mgdStudentForm.admissionNumber.trim())) errs.admissionNumber = "Invalid admission number";
    if (!availableStudentClasses.includes(String(mgdStudentForm.class))) errs.class = "Select a valid class";
    const validSections = availableSectionsForStudentClass(String(mgdStudentForm.class));
    if (!validSections.includes(String(mgdStudentForm.section))) errs.section = "Select a valid section";

    if (!errs.admissionNumber) {
      const dup = (mgdStudentList || []).find((s: any) => s.admissionNumber === mgdStudentForm.admissionNumber && s.id !== editingId);
      if (dup) errs.admissionNumber = "Admission number already exists";
    }
    if (!errs.email) {
      const dupEmail = (mgdStudentList || []).find((s: any) => (s.email || "").toLowerCase() === mgdStudentForm.email.toLowerCase() && s.id !== editingId);
      if (dupEmail) errs.email = "Email already exists";
    }
    return errs;
  };

  // ── CSV upload with validation ──────────────────────────────────────────────
  const handleCsvUpload = (file: File, type: string) => {
    setBulkUploadType(type);
    setBulkUploadErrors([]);
    setBulkUploadResult(null);

    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv")) {
      setBulkUploadErrors([
        `Invalid file type: "${file.name}". Only CSV files (.csv) are accepted.`,
        "Please download the CSV template, fill it in, and re-upload.",
      ]);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parseAndSubmit = (rows: any[]) => {
          if (!rows.length) { setBulkUploadErrors(["The uploaded file is empty. Please fill in at least one data row."]); return; }
          const errs = validateExcelRows(rows, type);
          if (errs.length) { setBulkUploadErrors(errs); return; }
          if (type === "classSection") bulkUploadClassSectionsMut.mutate(rows);
          else if (type === "mgdStudent") bulkUploadMgdStudentsMut.mutate(rows);
          else if (type === "mgdTeacher") bulkUploadMgdTeachersMut.mutate(rows);
        };

        const text = (e.target?.result as string).replace(/^\uFEFF/, "");
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { setBulkUploadErrors(["File appears empty. Ensure it has a header row and at least one data row."]); return; }

        let startIdx = 0;
        let delimiter = ",";
        const sepMatch = lines[0].trim().match(/^sep=(.)$/i);
        if (sepMatch) {
          delimiter = sepMatch[1];
          startIdx = 1;
        } else {
          const first = lines[0];
          if (first.includes(";") && !first.includes(",")) delimiter = ";";
          if (first.includes("\t") && !first.includes(",") && !first.includes(";")) delimiter = "\t";
        }

        const splitRow = (line: string) =>
          delimiter === "," ? parseCsvLine(line) : line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ""));

        if (lines.length - startIdx < 2) { setBulkUploadErrors(["File appears empty. Ensure it has a header row and at least one data row."]); return; }
        const headers = splitRow(lines[startIdx]).map(h => h.replace(/^\uFEFF/, ""));
        const rows = lines.slice(startIdx + 1).map(line => {
          const cols = splitRow(line);
          const obj: any = {};
          headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
          return obj;
        });
        parseAndSubmit(rows);
      } catch {
        setBulkUploadErrors(["Could not parse the uploaded file. Ensure you are uploading a valid CSV file."]);
      }
    };
    reader.readAsText(file);
  };

  // ── Template downloads as CSV ──────────────────────────────────────────────
  const downloadTemplate = (type: string) => {
    const defs: Record<string, { header: string[]; rows: string[][] }> = {
      classSection: {
        header: ["class", "section", "subjects"],
        rows: [["5", "A", "English,Maths,Science"]],
      },
      mgdStudent: {
        header: ["studentName", "phoneNumber", "email", "admissionNumber", "class", "section"],
        rows: [["Rahul Sharma", "9876543210", "rahul@school.edu", "2024001", "5", "A"]],
      },
      mgdTeacher: {
        header: ["teacherName", "employeeId", "email", "phoneNumber", "assignmentsJson", "isClassTeacher", "classTeacherOfClass", "classTeacherOfSection"],
        rows: [
          ["Ramesh Singh", "T100", "ramesh@school.edu", "9876543210", '[{"class":"5","section":"A","subjects":["English","Maths"]},{"class":"6","section":"B","subjects":["Science"]}]', "true", "5", "A"],
          ["Neha Iyer", "T101", "neha@school.edu", "9876501111", '[{"class":"7","section":"A","subjects":["Maths"]},{"class":"8","section":"A","subjects":["Physics","Maths"]}]', "false", "", ""],
        ],
      },
    };
    const def = defs[type];
    if (!def) return;
    const csv = [def.header, ...def.rows].map(r => r.map(c => `"${c}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template_${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Chat ──
  const { data: messages, refetch: refetchMessages } = useQuery<any[]>({ queryKey: ["/api/chat/messages", activeConversationId], queryFn: () => fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`).then(r => r.json()), enabled: !!activeConversationId });
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (avaRef.current && !avaRef.current.contains(e.target as Node)) setShowAvaMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const startConversation = useMutation({ mutationFn: () => fetchWithAuth("/api/chat/conversations", { method: "POST", body: JSON.stringify({ title: "School Analysis" }) }).then(r => r.json()), onSuccess: (d) => { setActiveConversationId(d.id); queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] }); } });
  const sendMessage = useMutation({ mutationFn: (content: string) => fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`, { method: "POST", body: JSON.stringify({ content }) }).then(r => r.json()), onSuccess: () => { setChatMessage(""); refetchMessages(); } });

  // ── Derived data for Overview ──────────────────────────────────────────────
  const safeStudents: any[] = mgdStudentList ?? [];
  const safeTeachers: any[] = mgdTeacherList ?? [];
  const safeSections: any[] = classSectionList ?? [];
  const totalStudents = safeStudents.length;
  const totalTeachers = safeTeachers.length;
  const totalClasses = safeSections.length;
  const totalSubjects = Array.from(new Set(safeSections.flatMap((cs: any) => {
    try { return JSON.parse(cs.subjects || "[]"); } catch { return []; }
  }))).length;
  const avgClassSize = totalClasses > 0 ? (totalStudents / totalClasses).toFixed(1) : "—";
  const stuTeacherRatio = totalTeachers > 0 ? (totalStudents / totalTeachers).toFixed(1) : "—";

  const studentsPerClass: Record<string, number> = {};
  safeStudents.forEach(s => { const k = `Class ${s.class}`; studentsPerClass[k] = (studentsPerClass[k] ?? 0) + 1; });

  const studentsPerSection: Record<string, number> = {};
  safeStudents.forEach(s => { const k = `${s.class}-${s.section}`; studentsPerSection[k] = (studentsPerSection[k] ?? 0) + 1; });

  const teachersPerSubject: Record<string, Set<number>> = {};
  safeTeachers.forEach(t => {
    const assignments: any[] = (() => { try { return JSON.parse(t.assignments); } catch { return []; } })();
    assignments.forEach((a: any) => { (a.subjects ?? []).forEach((sub: string) => { if (!teachersPerSubject[sub]) teachersPerSubject[sub] = new Set(); teachersPerSubject[sub].add(t.id); }); });
  });

  const gradeWise: Record<string, number> = {};
  safeStudents.forEach(s => { const k = `Grade ${s.class}`; gradeWise[k] = (gradeWise[k] ?? 0) + 1; });

  const userName = (user as any)?.name || "Admin";
  const initials = getInitials(userName);

  if (kpisLoading && !kpis) {
    return (
      <div className="sf-root sf-fullscreen-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // ── Upload error/success banner ─────────────────────────────────────────────
  const UploadSuccessBanner = () => (showUploadBannerInCurrentTab && bulkUploadResult) ? (
    <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #86efac", fontSize: 13 }}>
      ✅ Created {bulkUploadResult.created} records.
    </div>
  ) : null;

  const duplicateReason = (id: string): string => {
    if (bulkUploadType === "mgdStudent") return `${id}: Admission number already exists`;
    if (bulkUploadType === "mgdTeacher") return `${id}: Employee ID already exists`;
    if (bulkUploadType === "classSection") return `${id}: Class-section already exists`;
    return `${id}: Duplicate record`;
  };
  const uploadFailureDetails = [
    ...bulkUploadErrors,
    ...((bulkUploadResult?.duplicates || []).map((d: string) => duplicateReason(d))),
  ];
  const activeUploadSectionByType: Record<string, string> = {
    classSection: "mgd-classes",
    mgdStudent: "mgd-students",
    mgdTeacher: "mgd-teachers",
  };
  const showUploadBannerInCurrentTab = !!bulkUploadType && activeUploadSectionByType[bulkUploadType] === activeSection;
  const isPartialFailure = !!bulkUploadResult && (
    (bulkUploadResult.created ?? 0) > 0 ||
    (bulkUploadResult.duplicates?.length ?? 0) > 0 ||
    bulkUploadErrors.length > 0
  );

  const UploadErrorBanner = () => (showUploadBannerInCurrentTab && uploadFailureDetails.length > 0) ? (
    <div style={{ marginTop: 12, padding: "12px 16px", background: "#fff5f5", borderRadius: 8, border: "1px solid #fecaca", fontSize: 13 }}>
      <div style={{ fontWeight: 700, color: "#c93c3c", marginBottom: 6 }}>
        {isPartialFailure ? "⚠️ Upload partially failed — some rows were skipped:" : "⚠️ Upload failed — please fix the following issues:"}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, color: "#c93c3c", lineHeight: 1.75 }}>
        {uploadFailureDetails.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
      <button
        onClick={() => { setBulkUploadErrors([]); setBulkUploadResult(null); }}
        style={{ marginTop: 8, fontSize: 11, color: "var(--mid)", background: "none", border: "none", cursor: "pointer" }}
      >
        Dismiss
      </button>
    </div>
  ) : null;

  return (
    <div className="sf-root">
      {/* ── TOP NAV ─────────────────────────────────────────────────────────── */}
      <nav className="sf-topnav">
        <div className="sf-logo">
          <div className="sf-logo-mark teacher" style={{ background: "var(--ink)" }}>A</div>
          <span className="sf-logo-name">ScholarFlow</span>
          <span className="sf-teacher-pill" style={{ background: "var(--ink)", color: "var(--white)", border: "none" }}>ADMIN</span>
        </div>

        <div className="sf-nav-tabs">
          {/* FIX #7 — Overview tab is first and default */}
          <button className={`sf-nav-tab${activeSection === "overview" ? " on" : ""}`} onClick={() => setActiveSection("overview")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            Overview
          </button>
          <button className={`sf-nav-tab${activeSection === "mgd-classes" ? " on" : ""}`} onClick={() => setActiveSection("mgd-classes")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
            Class &amp; Subjects
          </button>
          <button className={`sf-nav-tab${activeSection === "mgd-students" ? " on" : ""}`} onClick={() => setActiveSection("mgd-students")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Students
          </button>
          <button className={`sf-nav-tab${activeSection === "mgd-teachers" ? " on" : ""}`} onClick={() => setActiveSection("mgd-teachers")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            Teachers
          </button>
          <button className={`sf-nav-tab${activeSection === "custom-insights" ? " on" : ""}`} onClick={() => setActiveSection("custom-insights")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            AI Insights
          </button>
        </div>

        <div className="sf-nav-right">
          <div className="sf-ava teacher" ref={avaRef} onClick={() => setShowAvaMenu(v => !v)} data-testid="button-avatar">
            {initials}
            {showAvaMenu && (
              <div className="sf-ava-menu">
                <button className="sf-ava-menu-item" onClick={() => { setIsProfilePanelOpen(true); setShowAvaMenu(false); }}>My Profile</button>
                <button className="sf-ava-menu-item danger" onClick={() => logout()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── PAGE ────────────────────────────────────────────────────────────── */}
      <div className="sf-page">

        <div className="sf-page-head">
          <div>
            {/* FIX #2: Greeting always says "Admin" */}
            <div className="sf-page-title">{getGreeting()}, Admin.</div>
            <div className="sf-page-sub">{new Date().toDateString()} &nbsp;·&nbsp; School-wide governance, analytics and intelligence</div>
          </div>
        </div>

        {/* ── KPI cards — overview tab only ── */}
        {false && activeSection === "overview" && (
          <div className="sf-funnel" style={{ gridTemplateColumns: "repeat(3, 1fr)", rowGap: "20px" }}>
            {[
              { id: "kpi-health",       label: "School Academic Health",  value: kpis ? `${kpis.healthScore}` : "–",                                          badge: kpis?.healthGrade,   badgeBg: kpis?.healthGrade === "A" ? "var(--green-bg)" : kpis?.healthGrade === "B" ? "var(--amber-bg)" : "var(--red-bg)", badgeColor: kpis?.healthGrade === "A" ? "var(--green)" : kpis?.healthGrade === "B" ? "var(--amber)" : "var(--red)", numColor: kpis ? kpiColor(kpis.healthScore) : undefined,               delta: kpis ? (kpis.healthScore >= 65 ? `↑ Grade ${kpis.healthGrade}` : "→ Needs focus") : "Loading", deltaUp: kpis?.healthScore >= 65, desc: "Composite of performance, engagement and teacher effectiveness." },
              { id: "kpi-improvement",  label: "Academic Improvement",     value: kpis ? `${kpis.improvementIndex}%` : "–",                                    numColor: kpis ? kpiColor(kpis.improvementIndex) : undefined,                delta: kpis ? `${kpis.improvementCount} of ${kpis.improvementTotal} students` : "Loading",            deltaUp: kpis?.improvementIndex >= 50, desc: "Students whose latest exam score exceeds their first attempt." },
              { id: "kpi-intervention", label: "Require Intervention",     value: kpis ? kpis.interventionCount : "–",                                          numColor: kpis?.interventionCount > 0 ? "var(--red)" : "var(--green)",   delta: kpis ? (kpis.interventionCount === 0 ? "↑ All above 50%" : "→ Avg below 50%") : "Loading",        deltaUp: kpis?.interventionCount === 0, desc: "Students with overall average below 50% across all exams." },
              { id: "kpi-teacher",      label: "Teacher Effectiveness",    value: kpis ? `${kpis.teacherEffectivenessScore}` : "–",                             numColor: kpis ? kpiColor(kpis.teacherEffectivenessScore) : undefined,   delta: kpis ? (kpis.teacherEffectivenessScore >= 70 ? "↑ Consistent outcomes" : "→ Variation detected") : "Loading", deltaUp: kpis?.teacherEffectivenessScore >= 70, desc: "Score based on consistency of class performance across teachers." },
              { id: "kpi-engagement",   label: "Learning Engagement",      value: kpis ? `${kpis.engagementIndex}%` : "–",                                      numColor: kpis ? kpiColor(kpis.engagementIndex) : undefined,             delta: kpis ? (kpis.engagementIndex >= 60 ? "↑ Good participation" : "→ Needs push") : "Loading",         deltaUp: kpis?.engagementIndex >= 60, desc: "Homework submission rate across all assigned homework tasks." },
              { id: "kpi-homework-eff", label: "Homework Effectiveness",   value: kpis ? (kpis.homeworkEffectivenessIndex > 0 ? `${kpis.homeworkEffectivenessIndex}%` : "–") : "–", numColor: kpis ? kpiColor(kpis.homeworkEffectivenessIndex) : undefined, delta: kpis?.homeworkEffectivenessIndex > 0 ? "Correctness score avg" : "→ No submissions yet", deltaUp: false, desc: "Average correctness score from AI-graded homework submissions." },
            ].map((kpi, idx) => (
              <div
                key={kpi.id}
                data-testid={kpi.id}
                className="sf-f-col"
                style={{
                  paddingLeft: idx % 3 === 0 ? 0 : undefined,
                  borderRight: idx % 3 === 2 ? "none" : undefined,
                }}
              >
                <div className="sf-f-cat">{kpi.label}</div>
                <div className="sf-f-num" style={{ color: kpi.numColor }}>
                  {kpi.value}
                  {kpi.badge && (
                    <span style={{ fontSize: 20, marginLeft: 4, fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: (kpi as any).badgeBg, color: (kpi as any).badgeColor }}>{kpi.badge}</span>
                  )}
                </div>
                <div className={`sf-f-delta ${kpi.deltaUp ? "sf-d-up" : "sf-d-flat"}`}>{kpi.delta}</div>
                <div className="sf-f-desc">{kpi.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            FIX #7 — OVERVIEW TAB (default landing page)
        ════════════════════════════════════════════════════════════════════ */}
        {activeSection === "overview" && (
          <div className="sf-panel">
            <div className="sf-panel-title">School Overview</div>
            <div className="sf-panel-sub" style={{ marginBottom: 24 }}>High-level summary across classes, students, teachers and subjects.</div>

            {/* ── STAT CARDS ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))", gap: 14, marginBottom: 24 }}>
              {[
                { emoji: "🏫", label: "Total Classes",   value: totalClasses,  accent: "#7C6FF7", bg: "#F0EFFE" },
                { emoji: "👨‍🎓", label: "Total Students", value: totalStudents, accent: "#3fa86e", bg: "#EBF8F2" },
                { emoji: "👩‍🏫", label: "Total Teachers", value: totalTeachers, accent: "#D97706", bg: "#FFF7E6" },
                { emoji: "📚", label: "Total Subjects",  value: totalSubjects, accent: "#D95B8D", bg: "#FEF0F5" },
              ].map(card => (
                <div key={card.label} style={{ background: card.bg, borderRadius: 16, padding: "18px 20px", border: `1.5px solid ${card.accent}20`, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ fontSize: 24 }}>{card.emoji}</div>
                  <div style={{ fontFamily: "Fraunces, serif", fontSize: 38, fontWeight: 800, color: card.accent, lineHeight: 1, letterSpacing: -1 }}>{card.value}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: card.accent, opacity: 0.75 }}>{card.label}</div>
                </div>
              ))}
            </div>

            {/* ── DERIVED METRICS ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 24, background: "var(--lav-card)", borderRadius: 14, padding: "16px 20px" }}>
              {[
                { label: "Avg Class Size",          value: avgClassSize,                                               unit: "students / section" },
                { label: "Student : Teacher Ratio", value: stuTeacherRatio === "—" ? "—" : `${stuTeacherRatio} : 1`, unit: "per teacher"        },
                { label: "Class Sections",          value: totalClasses,                                               unit: "sections total"     },
                { label: "Subjects on record",      value: totalSubjects,                                              unit: "in database"        },
              ].map(m => (
                <div key={m.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(26,26,46,0.4)", marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 800, color: "var(--ink)", lineHeight: 1 }}>{m.value}</div>
                  <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 2 }}>{m.unit}</div>
                </div>
              ))}
            </div>

            {/* ── CHARTS 2×2 GRID ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              <div className="sf-card" style={{ margin: 0 }}>
                <div className="sf-card-title" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <BarChart2 size={13} style={{ color: CHART_PALETTE[0], flexShrink: 0 }} />
                  Students per Class
                </div>
                <MiniBarChart emptyMsg="Add students to see this chart"
                  data={Object.entries(studentsPerClass).sort((a, b) => parseInt(a[0].replace("Class ", "")) - parseInt(b[0].replace("Class ", ""))).map(([label, value], i) => ({ label, value, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
              </div>

              <div className="sf-card" style={{ margin: 0 }}>
                <div className="sf-card-title" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <Layers size={13} style={{ color: CHART_PALETTE[1], flexShrink: 0 }} />
                  Students per Section
                </div>
                <MiniBarChart emptyMsg="Add students to see this chart"
                  data={Object.entries(studentsPerSection).sort((a, b) => a[0].localeCompare(b[0])).map(([label, value], i) => ({ label, value, color: CHART_PALETTE[(i + 2) % CHART_PALETTE.length] }))} />
              </div>

              <div className="sf-card" style={{ margin: 0 }}>
                <div className="sf-card-title" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <GraduationCap size={13} style={{ color: CHART_PALETTE[2], flexShrink: 0 }} />
                  Teachers per Subject
                </div>
                <MiniBarChart emptyMsg="Assign teachers to subjects first"
                  data={Object.entries(teachersPerSubject).sort((a, b) => b[1].size - a[1].size).map(([label, set], i) => ({ label, value: set.size, color: CHART_PALETTE[(i + 1) % CHART_PALETTE.length] }))} />
              </div>

              <div className="sf-card" style={{ margin: 0 }}>
                <div className="sf-card-title" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <BookMarked size={13} style={{ color: CHART_PALETTE[3], flexShrink: 0 }} />
                  Grade-wise Distribution
                </div>
                {Object.keys(gradeWise).length === 0
                  ? <div style={{ textAlign: "center", padding: "28px 0", color: "var(--mid)", fontSize: 13 }}>Add students to see this chart</div>
                  : <DonutChart slices={Object.entries(gradeWise).sort((a, b) => parseInt(a[0].replace("Grade ", "")) - parseInt(b[0].replace("Grade ", ""))).map(([label, value], i) => ({ label, value, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
                }
              </div>

            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            CLASS & SUBJECTS TAB — FIX #5: delete class only, no per-subject delete
        ════════════════════════════════════════════════════════════════════ */}
        {activeSection === "mgd-classes" && (
          <div className="sf-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="sf-panel-title">Class &amp; Subject Management</div>
                <div className="sf-panel-sub">Manage class sections and their subject assignments</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="outline" onClick={() => downloadTemplate("classSection")} style={{ fontSize: 12 }}>⬇ Download Template</Button>
                <label style={{ cursor: "pointer" }}>
                  <span style={{ fontSize: 12, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", display: "inline-block" }}>⬆ Upload CSV</span>
                  <input type="file" accept=".csv" style={{ display: "none" }} onChange={e => { setBulkUploadResult(null); setBulkUploadErrors([]); if (e.target.files?.[0]) handleCsvUpload(e.target.files[0], "classSection"); e.target.value = ""; }} />
                </label>
                <Button onClick={() => { setShowAddClassSection(true); setEditingClassSection(null); setClassSectionForm({ className: "", section: "", subjects: [] }); setClassSectionErrors({}); }}>
                  <Plus size={14} style={{ marginRight: 8 }} /> Add Class
                </Button>
              </div>
            </div>
            <UploadSuccessBanner />
            <UploadErrorBanner />

            {/* "Add Class" form — shown at top only for new entries */}
            {showAddClassSection && !editingClassSection && (
              <div className="sf-card" style={{ marginTop: 16 }}>
                <div className="sf-card-title">Add Class Section</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 12 }}>
                  <div>
                    <Input placeholder="Class (integer, e.g. 5)" type="number" value={classSectionForm.className} onChange={e => setClassSectionForm(v => ({ ...v, className: e.target.value }))} style={{ borderColor: classSectionErrors.className ? "#d94f4f" : undefined }} />
                    {classSectionErrors.className && <div style={{ fontSize: 11, color: "#d94f4f" }}>{classSectionErrors.className}</div>}
                  </div>
                  <div>
                    <Input placeholder="Section (A-Z)" value={classSectionForm.section} maxLength={1} onChange={e => setClassSectionForm(v => ({ ...v, section: e.target.value.toUpperCase() }))} style={{ borderColor: classSectionErrors.section ? "#d94f4f" : undefined }} />
                    {classSectionErrors.section && <div style={{ fontSize: 11, color: "#d94f4f" }}>{classSectionErrors.section}</div>}
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--mid)", marginBottom: 6 }}>Subjects (select multiple)</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["English", "Hindi", "Maths", "Science"].map(sub => (
                      <label key={sub} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${classSectionForm.subjects.includes(sub) ? "#4b5563" : "var(--rule)"}`, background: classSectionForm.subjects.includes(sub) ? "#eef2f7" : "var(--pane)" }}>
                        <input type="checkbox" checked={classSectionForm.subjects.includes(sub)} onChange={e => setClassSectionForm(v => ({ ...v, subjects: e.target.checked ? [...v.subjects, sub] : v.subjects.filter(s => s !== sub) }))} style={{ display: "none" }} />{sub}
                      </label>
                    ))}
                  </div>
                  {classSectionErrors.subjects && <div style={{ fontSize: 11, color: "#d94f4f" }}>{classSectionErrors.subjects}</div>}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Button onClick={() => {
                    const errs: any = {};
                    if (!classSectionForm.className || isNaN(parseInt(classSectionForm.className))) errs.className = "Integer required";
                    if (!classSectionForm.section || !/^[A-Z]$/.test(classSectionForm.section)) errs.section = "Single capital letter required";
                    if (!classSectionForm.subjects.length) errs.subjects = "Select at least one subject";
                    if (Object.keys(errs).length) { setClassSectionErrors(errs); return; }
                    const dup = (classSectionList || []).find((c: any) => String(c.className) === classSectionForm.className && c.section === classSectionForm.section);
                    if (dup) { setClassSectionErrors({ className: `Class ${classSectionForm.className}-${classSectionForm.section} already exists` }); return; }
                    setClassSectionErrors({});
                    addClassSectionMut.mutate({ className: parseInt(classSectionForm.className), section: classSectionForm.section, subjects: classSectionForm.subjects });
                  }}>Create</Button>
                  <Button variant="outline" onClick={() => { setShowAddClassSection(false); setClassSectionErrors({}); }}>Cancel</Button>
                </div>
              </div>
            )}

            {classSectionsLoading ? (
              <div style={{ textAlign: "center", padding: 32 }}><div className="sf-spinner" /></div>
            ) : !(classSectionList || []).length ? (
              <div className="sf-empty"><div className="sf-empty-icon">🏫</div>No class sections added yet.</div>
            ) : (() => {
              const byClass: Record<string, any[]> = {};
              (classSectionList || []).forEach((cs: any) => {
                const cls = String(cs.className);
                if (!byClass[cls]) byClass[cls] = [];
                byClass[cls].push(cs);
              });
              const sortedClasses = Object.keys(byClass).sort((a, b) => parseInt(a) - parseInt(b));
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                  {sortedClasses.map(cls => {
                    const classKey = `cls-${cls}`;
                    const sections = byClass[cls].sort((a: any, b: any) => a.section.localeCompare(b.section));
                    return (
                      <div key={cls} style={{ border: "1.5px solid var(--rule)", borderRadius: 12 }}>
                        {/* Class header */}
                        <button
                          onClick={() => setExpandedClass(prev => { const next = new Set(prev); next.has(classKey) ? next.delete(classKey) : next.add(classKey); return next; })}
                          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", background: "#f0effe", border: "none", borderRadius: expandedClass.has(classKey) ? "10px 10px 0 0" : 10, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 18 }}>🏫</span>
                            <span style={{ fontWeight: 700, fontSize: 15, color: "#3d2c8d" }}>Class {cls}</span>
                            <span style={{ fontSize: 12, color: "var(--mid)", fontWeight: 600 }}>{sections.length} section{sections.length !== 1 ? "s" : ""}</span>
                          </div>
                          <ChevronDown size={16} style={{ color: "#3d2c8d", transform: expandedClass.has(classKey) ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                        </button>

                        {expandedClass.has(classKey) && (
                          <div style={{ padding: "10px 14px 14px", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--rule)" }}>
                            {sections.map((cs: any) => {
                              const subjects: string[] = (() => { try { return JSON.parse(cs.subjects); } catch { return []; } })();
                              const menuId = cs.id;
                              const isEditingThis = editingClassSection?.id === cs.id;
                              return (
                                <div key={cs.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                  {/* Section row */}
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: isEditingThis ? "#f0effe" : "white", border: `1px solid ${isEditingThis ? "#b3a6f0" : "rgba(26,26,46,0.08)"}`, borderRadius: isEditingThis ? "10px 10px 0 0" : 10 }}>
                                    <div>
                                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ background: "#e8f5e9", color: "#2e7d32", borderRadius: 20, padding: "2px 10px", fontSize: 12 }}>Section {cs.section}</span>
                                      </div>
                                      <div style={{ fontSize: 12, color: "var(--mid)", marginTop: 6, display: "flex", flexWrap: "wrap", gap: 5 }}>
                                        {subjects.length ? subjects.map((sub) => (
                                          <span key={sub} style={{ display: "inline-block", padding: "2px 10px", background: "#eef2f7", border: "1px solid #d6dde7", borderRadius: 12, fontSize: 11, fontWeight: 600, color: "#334155" }}>{sub}</span>
                                        )) : <span style={{ color: "var(--mid)" }}>No subjects</span>}
                                      </div>
                                    </div>
                                    <InlineDropdown menuId={menuId} bulkDotMenu={bulkDotMenu} setBulkDotMenu={setBulkDotMenu}>
                                      <DropdownItem onClick={() => {
                                        setBulkDotMenu(null);
                                        if (isEditingThis) { setEditingClassSection(null); setClassSectionErrors({}); return; }
                                        setEditingClassSection(cs);
                                        setShowAddClassSection(false);
                                        setClassSectionForm({ className: String(cs.className), section: cs.section, subjects });
                                        setClassSectionErrors({});
                                      }}>✏️ {isEditingThis ? "Cancel Edit" : "Edit"}</DropdownItem>
                                      <DropdownItem danger onClick={() => { setBulkDotMenu(null); setDeleteConfirm({ type: "classSection", id: cs.id }); setDeletePassword(""); setDeleteError(""); }}>🗑 Delete class</DropdownItem>
                                    </InlineDropdown>
                                  </div>
                                  {/* Inline edit form — directly below the row */}
                                  {isEditingThis && (
                                    <div style={{ background: "#faf9ff", border: "1px solid #b3a6f0", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "14px 14px 16px" }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: "#3d2c8d", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Edit Section {cs.section}</div>
                                      <div style={{ fontSize: 12, color: "var(--mid)", marginBottom: 10 }}>Class and section are locked. Only subjects can be edited.</div>
                                      <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontSize: 11, color: "var(--mid)", marginBottom: 6 }}>Subjects</div>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                          {["English", "Hindi", "Maths", "Science"].map(sub => (
                                            <label key={sub} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${classSectionForm.subjects.includes(sub) ? "#4b5563" : "var(--rule)"}`, background: classSectionForm.subjects.includes(sub) ? "#eef2f7" : "var(--pane)" }}>
                                              <input type="checkbox" checked={classSectionForm.subjects.includes(sub)} onChange={e => setClassSectionForm(v => ({ ...v, subjects: e.target.checked ? [...v.subjects, sub] : v.subjects.filter(s => s !== sub) }))} style={{ display: "none" }} />{sub}
                                            </label>
                                          ))}
                                        </div>
                                        {classSectionErrors.subjects && <div style={{ fontSize: 11, color: "#d94f4f", marginTop: 4 }}>{classSectionErrors.subjects}</div>}
                                      </div>
                                      <div style={{ display: "flex", gap: 8 }}>
                                        <Button onClick={() => {
                                          const errs: any = {};
                                          if (!classSectionForm.subjects.length) errs.subjects = "Select at least one subject";
                                          if (Object.keys(errs).length) { setClassSectionErrors(errs); return; }
                                          setClassSectionErrors({});
                                          updateClassSectionMut.mutate({ id: editingClassSection.id, subjects: classSectionForm.subjects });
                                        }}>Save Changes</Button>
                                        <Button variant="outline" onClick={() => { setEditingClassSection(null); setClassSectionErrors({}); }}>Cancel</Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            MANAGED STUDENTS TAB
        ════════════════════════════════════════════════════════════════════ */}
        {activeSection === "mgd-students" && (
          <div className="sf-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="sf-panel-title">Student Management</div>
                <div className="sf-panel-sub">Add, edit and manage student records</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="outline" onClick={() => downloadTemplate("mgdStudent")} style={{ fontSize: 12 }}>⬇ Template</Button>
                <label style={{ cursor: "pointer" }}>
                  <span style={{ fontSize: 12, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", display: "inline-block" }}>⬆ Upload CSV</span>
                  <input type="file" accept=".csv" style={{ display: "none" }} onChange={e => { setBulkUploadResult(null); setBulkUploadErrors([]); if (e.target.files?.[0]) handleCsvUpload(e.target.files[0], "mgdStudent"); e.target.value = ""; }} />
                </label>
                <Button onClick={() => { setShowAddMgdStudent(true); setEditingMgdStudent(null); setMgdStudentForm({ studentName: "", phoneNumber: "", email: "", admissionNumber: "", class: "", section: "" }); setMgdStudentErrors({}); }}>
                  <Plus size={14} style={{ marginRight: 8 }} /> Add Student
                </Button>
              </div>
            </div>
            <UploadSuccessBanner />
            <UploadErrorBanner />

            {/* "Add Student" form — shown at top only for new entries */}
            {showAddMgdStudent && !editingMgdStudent && (
              <div className="sf-card" style={{ marginTop: 16 }}>
                <div className="sf-card-title">Add Student</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 12 }}>
                  <div>
                    <Input placeholder="Student Name" value={mgdStudentForm.studentName} onChange={e => setMgdStudentForm(v => ({ ...v, studentName: e.target.value }))} style={{ borderColor: mgdStudentErrors.studentName ? "#d94f4f" : undefined }} />
                    {mgdStudentErrors.studentName && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.studentName}</div>}
                  </div>
                  <div>
                    <Input placeholder="Phone Number" value={mgdStudentForm.phoneNumber} onChange={e => setMgdStudentForm(v => ({ ...v, phoneNumber: e.target.value }))} style={{ borderColor: mgdStudentErrors.phoneNumber ? "#d94f4f" : undefined }} />
                    {mgdStudentErrors.phoneNumber && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.phoneNumber}</div>}
                  </div>
                  <div>
                    <Input placeholder="Email" value={mgdStudentForm.email} onChange={e => setMgdStudentForm(v => ({ ...v, email: e.target.value }))} style={{ borderColor: mgdStudentErrors.email ? "#d94f4f" : undefined }} />
                    {mgdStudentErrors.email && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.email}</div>}
                  </div>
                  <div>
                    <Input placeholder="Admission Number (unique)" value={mgdStudentForm.admissionNumber} onChange={e => setMgdStudentForm(v => ({ ...v, admissionNumber: e.target.value }))} style={{ borderColor: mgdStudentErrors.admissionNumber ? "#d94f4f" : undefined }} />
                    {mgdStudentErrors.admissionNumber && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.admissionNumber}</div>}
                  </div>
                  <div>
                    <select
                      value={mgdStudentForm.class}
                      onChange={e => setMgdStudentForm(v => ({ ...v, class: e.target.value, section: "" }))}
                      style={{ width: "100%", height: 36, borderRadius: 8, border: `1px solid ${mgdStudentErrors.class ? "#d94f4f" : "var(--rule)"}`, background: "var(--pane)", padding: "0 10px", fontSize: 13 }}
                    >
                      <option value="">Select Class</option>
                      {availableStudentClasses.map((cls) => <option key={cls} value={cls}>Class {cls}</option>)}
                    </select>
                    {mgdStudentErrors.class && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.class}</div>}
                  </div>
                  <div>
                    <select
                      value={mgdStudentForm.section}
                      onChange={e => setMgdStudentForm(v => ({ ...v, section: e.target.value }))}
                      disabled={!mgdStudentForm.class}
                      style={{ width: "100%", height: 36, borderRadius: 8, border: `1px solid ${mgdStudentErrors.section ? "#d94f4f" : "var(--rule)"}`, background: "var(--pane)", padding: "0 10px", fontSize: 13, opacity: !mgdStudentForm.class ? 0.6 : 1 }}
                    >
                      <option value="">Select Section</option>
                      {availableSectionsForStudentClass(mgdStudentForm.class).map((sec) => <option key={sec} value={sec}>Section {sec}</option>)}
                    </select>
                    {mgdStudentErrors.section && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.section}</div>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Button onClick={() => {
                    const errs = validateMgdStudentForm();
                    if (Object.keys(errs).length) { setMgdStudentErrors(errs); return; }
                    setMgdStudentErrors({});
                    addMgdStudentMut.mutate(mgdStudentForm);
                  }}>Create</Button>
                  <Button variant="outline" onClick={() => { setShowAddMgdStudent(false); setMgdStudentErrors({}); }}>Cancel</Button>
                </div>
                {mgdStudentErrors._form && <div style={{ fontSize: 12, color: "#d94f4f", marginTop: 8 }}>{mgdStudentErrors._form}</div>}
              </div>
            )}

            {/* ── STUDENT SEARCH BAR ── */}
            {!mgdStudentsLoading && !!(mgdStudentList || []).length && (
              <div style={{ marginTop: 16, position: "relative" }}>
                <input
                  placeholder="🔍  Search by student name or admission number…"
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--rule)", fontSize: 13, fontFamily: "inherit", background: "var(--pane)", color: "var(--ink)", outline: "none", boxSizing: "border-box" }}
                />
                {studentSearch && (
                  <button onClick={() => setStudentSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--mid)", fontSize: 16 }}>✕</button>
                )}
              </div>
            )}

            {mgdStudentsLoading ? (
              <div style={{ textAlign: "center", padding: 32 }}><div className="sf-spinner" /></div>
            ) : !(mgdStudentList || []).length ? (
              <div className="sf-empty"><div className="sf-empty-icon">👨‍🎓</div>No students added yet.</div>
            ) : (() => {
              const q = studentSearch.trim().toLowerCase();
              const filtered = (mgdStudentList || []).filter((s: any) =>
                !q || s.studentName?.toLowerCase().includes(q) || s.admissionNumber?.toLowerCase().includes(q)
              );
              if (!filtered.length) return (
                <div className="sf-empty" style={{ marginTop: 16 }}><div className="sf-empty-icon">🔍</div>No students match your search.</div>
              );

              const renderStudentInlineEditForm = (s: any) => (
                <div style={{ background: "#faf9ff", border: "1px solid #b3a6f0", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "14px 14px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#3d2c8d", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Edit: {s.studentName}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
                    <div>
                      <Input placeholder="Student Name" value={mgdStudentForm.studentName} onChange={e => setMgdStudentForm(v => ({ ...v, studentName: e.target.value }))} style={{ borderColor: mgdStudentErrors.studentName ? "#d94f4f" : undefined }} />
                      {mgdStudentErrors.studentName && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.studentName}</div>}
                    </div>
                    <div>
                      <Input placeholder="Phone Number" value={mgdStudentForm.phoneNumber} onChange={e => setMgdStudentForm(v => ({ ...v, phoneNumber: e.target.value }))} style={{ borderColor: mgdStudentErrors.phoneNumber ? "#d94f4f" : undefined }} />
                      {mgdStudentErrors.phoneNumber && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.phoneNumber}</div>}
                    </div>
                    <div>
                      <Input placeholder="Email" value={mgdStudentForm.email} onChange={e => setMgdStudentForm(v => ({ ...v, email: e.target.value }))} style={{ borderColor: mgdStudentErrors.email ? "#d94f4f" : undefined }} />
                      {mgdStudentErrors.email && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.email}</div>}
                    </div>
                    <div>
                      <Input placeholder="Admission Number" value={mgdStudentForm.admissionNumber} onChange={e => setMgdStudentForm(v => ({ ...v, admissionNumber: e.target.value }))} style={{ borderColor: mgdStudentErrors.admissionNumber ? "#d94f4f" : undefined }} />
                      {mgdStudentErrors.admissionNumber && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.admissionNumber}</div>}
                    </div>
                    <div>
                      <select
                        value={mgdStudentForm.class}
                        onChange={e => setMgdStudentForm(v => ({ ...v, class: e.target.value, section: "" }))}
                        style={{ width: "100%", height: 36, borderRadius: 8, border: `1px solid ${mgdStudentErrors.class ? "#d94f4f" : "var(--rule)"}`, background: "var(--pane)", padding: "0 10px", fontSize: 13 }}
                      >
                        <option value="">Select Class</option>
                        {availableStudentClasses.map((cls) => <option key={cls} value={cls}>Class {cls}</option>)}
                      </select>
                      {mgdStudentErrors.class && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.class}</div>}
                    </div>
                    <div>
                      <select
                        value={mgdStudentForm.section}
                        onChange={e => setMgdStudentForm(v => ({ ...v, section: e.target.value }))}
                        disabled={!mgdStudentForm.class}
                        style={{ width: "100%", height: 36, borderRadius: 8, border: `1px solid ${mgdStudentErrors.section ? "#d94f4f" : "var(--rule)"}`, background: "var(--pane)", padding: "0 10px", fontSize: 13, opacity: !mgdStudentForm.class ? 0.6 : 1 }}
                      >
                        <option value="">Select Section</option>
                        {availableSectionsForStudentClass(mgdStudentForm.class).map((sec) => <option key={sec} value={sec}>Section {sec}</option>)}
                      </select>
                      {mgdStudentErrors.section && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.section}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button onClick={() => {
                      const errs = validateMgdStudentForm(s.id);
                      if (Object.keys(errs).length) { setMgdStudentErrors(errs); return; }
                      setMgdStudentErrors({});
                      updateMgdStudentMut.mutate({ id: s.id, ...mgdStudentForm });
                    }}>Save Changes</Button>
                    <Button variant="outline" onClick={() => { setEditingMgdStudent(null); setMgdStudentErrors({}); }}>Cancel</Button>
                  </div>
                </div>
              );

              if (q) {
                // Flat list for search results, with inline edit
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                    {filtered.map((s: any) => {
                      const menuId = s.id + 10000;
                      const isEditingThis = editingMgdStudent?.id === s.id;
                      return (
                        <div key={s.id} style={{ display: "flex", flexDirection: "column" }}>
                          <div className="sf-exam-item" style={{ cursor: "default", padding: "12px 16px", justifyContent: "space-between", alignItems: "flex-start", overflow: "visible", background: isEditingThis ? "#f0effe" : undefined, borderRadius: isEditingThis ? "10px 10px 0 0" : undefined, border: isEditingThis ? "1px solid #b3a6f0" : undefined }}>
                            <div>
                              <div className="sf-exam-name">{s.studentName}</div>
                              <div className="sf-exam-meta">Admission: {s.admissionNumber} · Class {s.class}-{s.section}</div>
                              {s.email && <div className="sf-exam-meta">{s.email}</div>}
                            </div>
                            <InlineDropdown menuId={menuId} bulkDotMenu={bulkDotMenu} setBulkDotMenu={setBulkDotMenu}>
                              <DropdownItem onClick={() => { setBulkDotMenu(null); if (isEditingThis) { setEditingMgdStudent(null); return; } setEditingMgdStudent(s); setShowAddMgdStudent(false); setMgdStudentForm({ studentName: s.studentName, phoneNumber: s.phoneNumber || "", email: s.email || "", admissionNumber: s.admissionNumber, class: s.class, section: s.section }); setMgdStudentErrors({}); }}>✏️ {isEditingThis ? "Cancel Edit" : "Edit"}</DropdownItem>
                              <DropdownItem danger onClick={() => { setBulkDotMenu(null); setDeleteConfirm({ type: "mgdStudent", id: s.id }); setDeletePassword(""); setDeleteError(""); }}>🗑 Delete</DropdownItem>
                            </InlineDropdown>
                          </div>
                          {isEditingThis && renderStudentInlineEditForm(s)}
                        </div>
                      );
                    })}
                  </div>
                );
              }

              // Hierarchical grouping: Class → Section
              const byClass: Record<string, any[]> = {};
              filtered.forEach((s: any) => {
                const cls = `Class ${s.class}`;
                if (!byClass[cls]) byClass[cls] = [];
                byClass[cls].push(s);
              });

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                  {Object.keys(byClass).sort((a, b) => parseInt(a.replace("Class ", "")) - parseInt(b.replace("Class ", ""))).map(cls => {
                    const classKey = `cls-${cls}`;
                    const bySection: Record<string, any[]> = {};
                    byClass[cls].forEach((s: any) => {
                      const sec = `Section ${s.section}`;
                      if (!bySection[sec]) bySection[sec] = [];
                      bySection[sec].push(s);
                    });

                    return (
                      <div key={cls} style={{ border: "1.5px solid var(--rule)", borderRadius: 12 }}>
                        <button
                          onClick={() => setExpandedStudentClass(prev => { const next = new Set(prev); next.has(classKey) ? next.delete(classKey) : next.add(classKey); return next; })}
                          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", background: "#f4f6f8", border: "none", borderRadius: expandedStudentClass.has(classKey) ? "10px 10px 0 0" : 10, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 18 }}>🏫</span>
                            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>{cls}</span>
                            <span style={{ fontSize: 12, color: "var(--mid)", fontWeight: 600 }}>{byClass[cls].length} student{byClass[cls].length !== 1 ? "s" : ""}</span>
                          </div>
                          <ChevronDown size={16} style={{ color: "var(--mid)", transform: expandedStudentClass.has(classKey) ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                        </button>

                        {expandedStudentClass.has(classKey) && (
                          <div style={{ padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--rule)" }}>
                            {Object.keys(bySection).sort().map(sec => {
                              const secKey = `${classKey}-${sec}`;
                              return (
                                <div key={sec} style={{ border: "1px solid rgba(26,26,46,0.07)", borderRadius: 8 }}>
                                  <button
                                    onClick={() => setExpandedStudentSection(prev => { const next = new Set(prev); next.has(secKey) ? next.delete(secKey) : next.add(secKey); return next; })}
                                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(26,26,46,0.02)", border: "none", borderRadius: expandedStudentSection.has(secKey) ? "6px 6px 0 0" : 6, cursor: "pointer", fontFamily: "inherit" }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                      <span style={{ fontSize: 13 }}>📋</span>
                                      <span style={{ fontWeight: 600, fontSize: 12, color: "var(--ink)" }}>{sec}</span>
                                      <span style={{ fontSize: 11, color: "var(--mid)", fontWeight: 600 }}>{bySection[sec].length}</span>
                                    </div>
                                    <ChevronDown size={13} style={{ color: "var(--mid)", transform: expandedStudentSection.has(secKey) ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                                  </button>

                                  {expandedStudentSection.has(secKey) && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 0, borderTop: "1px solid rgba(26,26,46,0.05)" }}>
                                      {bySection[sec].map((s: any, idx: number) => {
                                        const menuId = s.id + 10000;
                                        const isEditingThis = editingMgdStudent?.id === s.id;
                                        return (
                                          <div key={s.id} style={{ display: "flex", flexDirection: "column" }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: idx > 0 ? "1px solid rgba(26,26,46,0.05)" : undefined, background: isEditingThis ? "#f0effe" : "white" }}>
                                              <div>
                                                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{s.studentName}</div>
                                                <div style={{ fontSize: 12, color: "var(--mid)" }}>Admission: {s.admissionNumber}{s.email ? ` · ${s.email}` : ""}</div>
                                              </div>
                                              <InlineDropdown menuId={menuId} bulkDotMenu={bulkDotMenu} setBulkDotMenu={setBulkDotMenu}>
                                                <DropdownItem onClick={() => { setBulkDotMenu(null); if (isEditingThis) { setEditingMgdStudent(null); return; } setEditingMgdStudent(s); setShowAddMgdStudent(false); setMgdStudentForm({ studentName: s.studentName, phoneNumber: s.phoneNumber || "", email: s.email || "", admissionNumber: s.admissionNumber, class: s.class, section: s.section }); setMgdStudentErrors({}); }}>✏️ {isEditingThis ? "Cancel Edit" : "Edit"}</DropdownItem>
                                                <DropdownItem danger onClick={() => { setBulkDotMenu(null); setDeleteConfirm({ type: "mgdStudent", id: s.id }); setDeletePassword(""); setDeleteError(""); }}>🗑 Delete</DropdownItem>
                                              </InlineDropdown>
                                            </div>
                                            {isEditingThis && renderStudentInlineEditForm(s)}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            MANAGED TEACHERS TAB
            FIX #4: Main view shows only Edit + Delete.
                     Subject removal is inside the Edit form.
        ════════════════════════════════════════════════════════════════════ */}
        {activeSection === "mgd-teachers" && (
          <div className="sf-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="sf-panel-title">Teacher Management</div>
                <div className="sf-panel-sub">Add teachers and assign class-section-subject combinations</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="outline" onClick={() => downloadTemplate("mgdTeacher")} style={{ fontSize: 12 }}>⬇ Template</Button>
                <label style={{ cursor: "pointer" }}>
                  <span style={{ fontSize: 12, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", display: "inline-block" }}>⬆ Upload CSV</span>
                  <input type="file" accept=".csv" style={{ display: "none" }} onChange={e => { setBulkUploadResult(null); setBulkUploadErrors([]); if (e.target.files?.[0]) handleCsvUpload(e.target.files[0], "mgdTeacher"); e.target.value = ""; }} />
                </label>
                <Button onClick={() => { setShowAddMgdTeacher(true); setEditingMgdTeacher(null); setMgdTeacherForm({ teacherName: "", employeeId: "", email: "", phoneNumber: "", assignments: [], isClassTeacher: false, classTeacherOf: "" }); setMgdTeacherErrors({}); setTeacherAssignClass(""); setTeacherAssignSection(""); setTeacherAssignSubjects([]); }}>
                  <Plus size={14} style={{ marginRight: 8 }} /> Add Teacher
                </Button>
              </div>
            </div>
            <UploadSuccessBanner />
            <UploadErrorBanner />

            {/* "Add Teacher" form — shown at top only for new entries */}
            {showAddMgdTeacher && !editingMgdTeacher && (() => {
              const availableSections = teacherAssignClass && classSectionList
                ? (classSectionList || []).filter((c: any) => String(c.className) === teacherAssignClass).map((c: any) => c.section)
                : [];
              const availableSubjects = teacherAssignClass && teacherAssignSection && classSectionList
                ? (() => { const cs = (classSectionList || []).find((c: any) => String(c.className) === teacherAssignClass && c.section === teacherAssignSection); try { return cs ? JSON.parse(cs.subjects) : []; } catch { return []; } })()
                : [];
              return (
                <div className="sf-card" style={{ marginTop: 16 }}>
                  <div className="sf-card-title">{editingMgdTeacher ? "Edit Teacher" : "Add Teacher"}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 12 }}>
                    <div>
                      <Input placeholder="Teacher Name" value={mgdTeacherForm.teacherName} onChange={e => setMgdTeacherForm(v => ({ ...v, teacherName: e.target.value }))} />
                      {mgdTeacherErrors.teacherName && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdTeacherErrors.teacherName}</div>}
                    </div>
                    <div>
                      <Input placeholder="Employee ID" value={mgdTeacherForm.employeeId} onChange={e => setMgdTeacherForm(v => ({ ...v, employeeId: e.target.value }))} />
                      {mgdTeacherErrors.employeeId && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdTeacherErrors.employeeId}</div>}
                    </div>
                    <Input placeholder="Email" value={mgdTeacherForm.email} onChange={e => setMgdTeacherForm(v => ({ ...v, email: e.target.value }))} />
                    <Input placeholder="Phone Number" value={mgdTeacherForm.phoneNumber} onChange={e => setMgdTeacherForm(v => ({ ...v, phoneNumber: e.target.value }))} />
                  </div>

                  <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(0,0,0,0.03)", borderRadius: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mid)", marginBottom: 8 }}>ASSIGN SUBJECTS</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--mid)", marginBottom: 4 }}>Step 1 — Class</div>
                        <select value={teacherAssignClass} onChange={e => { setTeacherAssignClass(e.target.value); setTeacherAssignSection(""); setTeacherAssignSubjects([]); }} style={{ width: "100%", height: 36, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", padding: "0 10px", fontSize: 13 }}>
                          <option value="">— Class —</option>
                          {[...new Set((classSectionList || []).map((c: any) => String(c.className)))].sort().map(cn => (<option key={cn} value={cn}>Class {cn}</option>))}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--mid)", marginBottom: 4 }}>Step 2 — Section</div>
                        <select value={teacherAssignSection} onChange={e => { setTeacherAssignSection(e.target.value); setTeacherAssignSubjects([]); }} disabled={!teacherAssignClass} style={{ width: "100%", height: 36, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", padding: "0 10px", fontSize: 13, opacity: !teacherAssignClass ? 0.5 : 1 }}>
                          <option value="">— Section —</option>
                          {availableSections.map((sec: string) => <option key={sec} value={sec}>Section {sec}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--mid)", marginBottom: 4 }}>Step 3 — Subjects</div>
                        {availableSubjects.length === 0 ? (
                          <div style={{ fontSize: 12, color: "var(--dim)", padding: "9px 0" }}>Select class + section first</div>
                        ) : (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {availableSubjects.map((sub: string) => (
                              <label key={sub} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer", padding: "4px 10px", borderRadius: 8, border: `1.5px solid ${teacherAssignSubjects.includes(sub) ? "var(--ink)" : "var(--rule)"}`, background: teacherAssignSubjects.includes(sub) ? "var(--lav-card)" : "var(--pane)" }}>
                                <input type="checkbox" checked={teacherAssignSubjects.includes(sub)} onChange={e => setTeacherAssignSubjects(v => e.target.checked ? [...v, sub] : v.filter(s => s !== sub))} style={{ display: "none" }} />{sub}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" disabled={!teacherAssignClass || !teacherAssignSection || !teacherAssignSubjects.length}
                      onClick={() => {
                        const newAssignment = { class: teacherAssignClass, section: teacherAssignSection, subjects: teacherAssignSubjects };
                        setMgdTeacherForm(v => ({ ...v, assignments: [...v.assignments.filter((a: any) => !(a.class === teacherAssignClass && a.section === teacherAssignSection)), newAssignment] }));
                        setTeacherAssignClass(""); setTeacherAssignSection(""); setTeacherAssignSubjects([]);
                      }}>+ Add Assignment</Button>

                    {/* FIX #4 — Subject removal chips inside Edit form */}
                    {mgdTeacherForm.assignments.length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                        {mgdTeacherForm.assignments.map((a: any, aIdx: number) => (
                          <div key={aIdx} style={{ background: "var(--pane)", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>Class {a.class}-{a.section}</span>
                              <button onClick={() => setMgdTeacherForm(v => ({ ...v, assignments: v.assignments.filter((_: any, j: number) => j !== aIdx) }))} style={{ background: "none", border: "none", cursor: "pointer", color: "#c93c3c", fontSize: 12, padding: "0 2px" }}>✕ Remove all</button>
                            </div>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              {(a.subjects || []).map((sub: string) => (
                                <span key={sub} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px 3px 8px", background: "white", borderRadius: 20, border: "1px solid var(--rule)", fontSize: 12 }}>
                                  {sub}
                                  <button onClick={() => {
                                    const newSubjects = a.subjects.filter((s: string) => s !== sub);
                                    if (newSubjects.length === 0) {
                                      setMgdTeacherForm(v => ({ ...v, assignments: v.assignments.filter((_: any, j: number) => j !== aIdx) }));
                                    } else {
                                      setMgdTeacherForm(v => ({ ...v, assignments: v.assignments.map((aa: any, j: number) => j === aIdx ? { ...aa, subjects: newSubjects } : aa) }));
                                    }
                                  }} style={{ background: "none", border: "none", cursor: "pointer", color: "#c93c3c", fontSize: 14, lineHeight: 1, padding: 0 }} title={`Remove ${sub}`}>×</button>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={mgdTeacherForm.isClassTeacher} onChange={e => setMgdTeacherForm(v => ({ ...v, isClassTeacher: e.target.checked }))} />
                      Is Class Teacher?
                    </label>
                    {mgdTeacherForm.isClassTeacher && (
                      <select value={mgdTeacherForm.classTeacherOf} onChange={e => setMgdTeacherForm(v => ({ ...v, classTeacherOf: e.target.value }))} style={{ marginTop: 8, height: 36, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", padding: "0 10px", fontSize: 13, minWidth: 200 }}>
                        <option value="">— Select class-section —</option>
                        {(classSectionList || []).map((c: any) => (<option key={c.id} value={`${c.className}-${c.section}`}>Class {c.className}-{c.section}</option>))}
                      </select>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <Button onClick={() => {
                      const errs: any = {};
                      if (!mgdTeacherForm.teacherName.trim()) errs.teacherName = "Name required";
                      if (!mgdTeacherForm.employeeId.trim()) errs.employeeId = "Employee ID required";
                      if (!errs.employeeId) {
                        const dup = (mgdTeacherList || []).find((t: any) => t.employeeId === mgdTeacherForm.employeeId);
                        if (dup) errs.employeeId = "Employee ID already exists";
                      }
                      if (Object.keys(errs).length) { setMgdTeacherErrors(errs); return; }
                      setMgdTeacherErrors({});
                      addMgdTeacherMut.mutate(mgdTeacherForm);
                    }}>Create</Button>
                    <Button variant="outline" onClick={() => { setShowAddMgdTeacher(false); setMgdTeacherErrors({}); }}>Cancel</Button>
                  </div>
                  {mgdTeacherErrors._form && <div style={{ fontSize: 12, color: "#d94f4f", marginTop: 8 }}>{mgdTeacherErrors._form}</div>}
                </div>
              );
            })()}

            {/* ── TEACHER SEARCH BAR ── */}
            {!mgdTeachersLoading && !!(mgdTeacherList || []).length && (
              <div style={{ marginTop: 16, position: "relative" }}>
                <input
                  placeholder="🔍  Search by teacher name or employee ID…"
                  value={teacherSearch}
                  onChange={e => setTeacherSearch(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--rule)", fontSize: 13, fontFamily: "inherit", background: "var(--pane)", color: "var(--ink)", outline: "none", boxSizing: "border-box" }}
                />
                {teacherSearch && (
                  <button onClick={() => setTeacherSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--mid)", fontSize: 16 }}>✕</button>
                )}
              </div>
            )}

            {mgdTeachersLoading ? (
              <div style={{ textAlign: "center", padding: 32 }}><div className="sf-spinner" /></div>
            ) : !(mgdTeacherList || []).length ? (
              <div className="sf-empty"><div className="sf-empty-icon">👩‍🏫</div>No teachers added yet.</div>
            ) : (() => {
              const q = teacherSearch.trim().toLowerCase();
              const filtered = (mgdTeacherList || []).filter((t: any) =>
                !q || t.teacherName?.toLowerCase().includes(q) || t.employeeId?.toLowerCase().includes(q)
              );
              if (!filtered.length) return (
                <div className="sf-empty" style={{ marginTop: 16 }}><div className="sf-empty-icon">🔍</div>No teachers match your search.</div>
              );

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                  {filtered.map((t: any) => {
                    const assignments: any[] = (() => { try { return JSON.parse(t.assignments); } catch { return []; } })();
                    const menuId = t.id + 20000;
                    const isEditingThis = editingMgdTeacher?.id === t.id;

                    return (
                      <div key={t.id} style={{ display: "flex", flexDirection: "column" }}>

                        {/* ── Teacher row ── */}
                        <div style={{
                          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                          padding: "13px 16px",
                          background: isEditingThis ? "#f0effe" : "white",
                          border: `1.5px solid ${isEditingThis ? "#b3a6f0" : "rgba(26,26,46,0.10)"}`,
                          borderRadius: isEditingThis ? "12px 12px 0 0" : 12,
                          transition: "border-color 0.15s, background 0.15s",
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{t.teacherName}</span>
                              <span style={{ fontSize: 11, background: "var(--lav-card)", color: "#3d2c8d", borderRadius: 20, padding: "2px 9px", fontWeight: 600 }}>{t.employeeId}</span>
                              {t.isClassTeacher === 1 && (
                                <span style={{ fontSize: 11, background: "#e8f5e9", color: "#2e7d32", borderRadius: 20, padding: "2px 9px", fontWeight: 600 }}>📋 Class Teacher · {t.classTeacherOf}</span>
                              )}
                            </div>
                            {(t.email || t.phoneNumber) && (
                              <div style={{ fontSize: 12, color: "var(--mid)", marginBottom: 6 }}>
                                {t.email}{t.phoneNumber ? ` · ${t.phoneNumber}` : ""}
                              </div>
                            )}
                            {assignments.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                                {assignments.map((a: any, aIdx: number) => (
                                  <div key={aIdx} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#f0effe", borderRadius: 8, padding: "4px 10px", border: "1px solid #ddd8f8" }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "#3d2c8d" }}>Cl {a.class}-{a.section}</span>
                                    <span style={{ width: 1, height: 12, background: "#ccc8ee", display: "inline-block" }} />
                                    {(a.subjects || []).map((sub: string) => (
                                      <span key={sub} style={{ display: "inline-block", padding: "1px 8px", background: "white", borderRadius: 10, border: "1px solid #ddd8f8", fontSize: 11, fontWeight: 500, color: "#555" }}>{sub}</span>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <InlineDropdown menuId={menuId} bulkDotMenu={bulkDotMenu} setBulkDotMenu={setBulkDotMenu}>
                            <DropdownItem onClick={() => {
                              setBulkDotMenu(null);
                              if (isEditingThis) { setEditingMgdTeacher(null); setMgdTeacherErrors({}); return; }
                              setEditingMgdTeacher(t);
                              setShowAddMgdTeacher(false);
                              setMgdTeacherForm({ teacherName: t.teacherName, employeeId: t.employeeId, email: t.email || "", phoneNumber: t.phoneNumber || "", assignments: assignments.map(a => ({ ...a, subjects: [...(a.subjects || [])] })), isClassTeacher: t.isClassTeacher === 1, classTeacherOf: t.classTeacherOf || "" });
                              setMgdTeacherErrors({});
                              setTeacherAssignClass(""); setTeacherAssignSection(""); setTeacherAssignSubjects([]);
                            }}>✏️ {isEditingThis ? "Cancel Edit" : "Edit"}</DropdownItem>
                            <DropdownItem danger onClick={() => { setBulkDotMenu(null); setDeleteConfirm({ type: "mgdTeacher", id: t.id }); setDeletePassword(""); setDeleteError(""); }}>🗑 Delete</DropdownItem>
                          </InlineDropdown>
                        </div>

                        {/* ── Inline edit panel ── */}
                        {isEditingThis && (() => {
                          // Class-sections already assigned in the draft
                          const draftAssignedKeys = new Set(mgdTeacherForm.assignments.map((a: any) => `${a.class}-${a.section}`));
                          // Available sections for the new-assignment picker (filter out already assigned)
                          const newAssignAvailableSections = teacherAssignClass && classSectionList
                            ? (classSectionList || [])
                                .filter((c: any) => String(c.className) === teacherAssignClass && !draftAssignedKeys.has(`${teacherAssignClass}-${c.section}`))
                                .map((c: any) => c.section)
                            : [];
                          const newAssignAvailableSubjects = teacherAssignClass && teacherAssignSection
                            ? (() => { const cs = (classSectionList || []).find((c: any) => String(c.className) === teacherAssignClass && c.section === teacherAssignSection); try { return cs ? JSON.parse(cs.subjects) : []; } catch { return []; } })()
                            : [];

                          return (
                            <div style={{ background: "#faf9ff", border: "1.5px solid #b3a6f0", borderTop: "none", borderRadius: "0 0 12px 12px", padding: "16px 16px 18px" }}>

                              {/* ── Profile fields ── */}
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#3d2c8d", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.09em" }}>Profile Details</div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
                                <div>
                                  <Input placeholder="Teacher Name" value={mgdTeacherForm.teacherName} onChange={e => setMgdTeacherForm(v => ({ ...v, teacherName: e.target.value }))} />
                                  {mgdTeacherErrors.teacherName && <div style={{ fontSize: 11, color: "#d94f4f", marginTop: 3 }}>{mgdTeacherErrors.teacherName}</div>}
                                </div>
                                <div>
                                  <Input placeholder="Employee ID" value={mgdTeacherForm.employeeId} onChange={e => setMgdTeacherForm(v => ({ ...v, employeeId: e.target.value }))} />
                                  {mgdTeacherErrors.employeeId && <div style={{ fontSize: 11, color: "#d94f4f", marginTop: 3 }}>{mgdTeacherErrors.employeeId}</div>}
                                </div>
                                <Input placeholder="Email" value={mgdTeacherForm.email} onChange={e => setMgdTeacherForm(v => ({ ...v, email: e.target.value }))} />
                                <Input placeholder="Phone Number" value={mgdTeacherForm.phoneNumber} onChange={e => setMgdTeacherForm(v => ({ ...v, phoneNumber: e.target.value }))} />
                              </div>
                              <div style={{ marginBottom: 16 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                                  <input type="checkbox" checked={mgdTeacherForm.isClassTeacher} onChange={e => setMgdTeacherForm(v => ({ ...v, isClassTeacher: e.target.checked }))} />
                                  Is Class Teacher?
                                </label>
                                {mgdTeacherForm.isClassTeacher && (
                                  <select value={mgdTeacherForm.classTeacherOf} onChange={e => setMgdTeacherForm(v => ({ ...v, classTeacherOf: e.target.value }))} style={{ marginTop: 8, height: 36, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", padding: "0 10px", fontSize: 13, minWidth: 200 }}>
                                    <option value="">— Select class-section —</option>
                                    {(classSectionList || []).map((c: any) => (<option key={c.id} value={`${c.className}-${c.section}`}>Class {c.className}-{c.section}</option>))}
                                  </select>
                                )}
                              </div>

                              {/* ── Divider ── */}
                              <div style={{ borderTop: "1px solid #e0dcf5", marginBottom: 16 }} />

                              {/* ── Subject Assignments (draft) ── */}
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#3d2c8d", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.09em" }}>Subject Assignments</div>
                              <div style={{ fontSize: 11, color: "var(--mid)", marginBottom: 12 }}>Changes below are staged — hit <strong>Save Changes</strong> at the bottom to apply all at once.</div>

                              {mgdTeacherForm.assignments.length === 0 ? (
                                <div style={{ fontSize: 12, color: "var(--mid)", marginBottom: 14, padding: "10px 12px", background: "rgba(0,0,0,0.03)", borderRadius: 8 }}>No assignments yet — add one below.</div>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                                  {mgdTeacherForm.assignments.map((a: any, aIdx: number) => {
                                    const csEntry = (classSectionList || []).find((c: any) => String(c.className) === String(a.class) && c.section === a.section);
                                    const allSubjectsForSlot: string[] = (() => { try { return csEntry ? JSON.parse(csEntry.subjects) : []; } catch { return []; } })();
                                    const currentSubs: string[] = a.subjects || [];
                                    const addableSubs = allSubjectsForSlot.filter((s: string) => !currentSubs.includes(s));
                                    return (
                                      <div key={aIdx} style={{ background: "white", borderRadius: 10, border: "1px solid #e0dcf5", padding: "10px 12px" }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                          <span style={{ fontSize: 13, fontWeight: 700, color: "#3d2c8d" }}>Class {a.class} — Section {a.section}</span>
                                          <button
                                            onClick={() => setMgdTeacherForm(v => ({ ...v, assignments: v.assignments.filter((_: any, i: number) => i !== aIdx) }))}
                                            style={{ background: "none", border: "none", cursor: "pointer", color: "#c93c3c", fontSize: 12, padding: "2px 6px", borderRadius: 6, display: "flex", alignItems: "center", gap: 4 }}
                                            onMouseEnter={e => (e.currentTarget.style.background = "#ffeaea")}
                                            onMouseLeave={e => (e.currentTarget.style.background = "none")}
                                          >🗑 Remove</button>
                                        </div>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                          {/* Current subjects — click × to stage removal */}
                                          {currentSubs.map((sub: string) => (
                                            <span key={sub} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 6px 4px 10px", background: "#e8e4fb", borderRadius: 20, border: "1px solid #c8c0f0", fontSize: 12, fontWeight: 600, color: "#3d2c8d" }}>
                                              {sub}
                                              <button
                                                onClick={() => {
                                                  const newSubs = currentSubs.filter((s: string) => s !== sub);
                                                  setMgdTeacherForm(v => ({
                                                    ...v,
                                                    assignments: newSubs.length
                                                      ? v.assignments.map((aa: any, i: number) => i === aIdx ? { ...aa, subjects: newSubs } : aa)
                                                      : v.assignments.filter((_: any, i: number) => i !== aIdx)
                                                  }));
                                                }}
                                                style={{ width: 16, height: 16, borderRadius: "50%", background: "#b3a6f0", border: "none", cursor: "pointer", color: "white", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0, flexShrink: 0 }}
                                                onMouseEnter={e => (e.currentTarget.style.background = "#c93c3c")}
                                                onMouseLeave={e => (e.currentTarget.style.background = "#b3a6f0")}
                                              >×</button>
                                            </span>
                                          ))}
                                          {/* Addable subjects — click + to stage addition */}
                                          {addableSubs.map((sub: string) => (
                                            <button
                                              key={sub}
                                              onClick={() => setMgdTeacherForm(v => ({ ...v, assignments: v.assignments.map((aa: any, i: number) => i === aIdx ? { ...aa, subjects: [...(aa.subjects || []), sub] } : aa) }))}
                                              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "white", borderRadius: 20, border: "1.5px dashed #b3a6f0", fontSize: 12, fontWeight: 600, color: "#7a6abf", cursor: "pointer" }}
                                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#e8e4fb"; (e.currentTarget as HTMLElement).style.borderStyle = "solid"; }}
                                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "white"; (e.currentTarget as HTMLElement).style.borderStyle = "dashed"; }}
                                            >+ {sub}</button>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* ── Add new assignment(s) — staged, not yet saved ── */}
                              <div style={{ padding: "12px 14px", background: "rgba(61,44,141,0.04)", borderRadius: 10, border: "1px dashed #c8c0f0", marginBottom: 18 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mid)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.07em" }}>Add New Assignment</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                                  <div>
                                    <div style={{ fontSize: 11, color: "var(--mid)", marginBottom: 4 }}>Class</div>
                                    <select
                                      value={teacherAssignClass}
                                      onChange={e => { setTeacherAssignClass(e.target.value); setTeacherAssignSection(""); setTeacherAssignSubjects([]); }}
                                      style={{ width: "100%", height: 36, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", padding: "0 10px", fontSize: 13 }}
                                    >
                                      <option value="">— Select Class —</option>
                                      {/* Only show classes that still have at least one unassigned section */}
                                      {[...new Set((classSectionList || []).map((c: any) => String(c.className)))]
                                        .sort()
                                        .filter((cn: string) => (classSectionList || []).some((c: any) => String(c.className) === cn && !draftAssignedKeys.has(`${cn}-${c.section}`)))
                                        .map((cn: string) => (<option key={cn} value={cn}>Class {cn}</option>))}
                                    </select>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 11, color: "var(--mid)", marginBottom: 4 }}>Section</div>
                                    <select
                                      value={teacherAssignSection}
                                      onChange={e => { setTeacherAssignSection(e.target.value); setTeacherAssignSubjects([]); }}
                                      disabled={!teacherAssignClass}
                                      style={{ width: "100%", height: 36, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", padding: "0 10px", fontSize: 13, opacity: !teacherAssignClass ? 0.5 : 1 }}
                                    >
                                      <option value="">— Select Section —</option>
                                      {/* Only unassigned sections */}
                                      {newAssignAvailableSections.map((sec: string) => <option key={sec} value={sec}>Section {sec}</option>)}
                                    </select>
                                  </div>
                                </div>
                                {teacherAssignClass && teacherAssignSection && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 11, color: "var(--mid)", marginBottom: 6 }}>Subjects</div>
                                    {newAssignAvailableSubjects.length === 0 ? (
                                      <div style={{ fontSize: 12, color: "var(--mid)" }}>No subjects found for this class-section.</div>
                                    ) : (
                                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        {newAssignAvailableSubjects.map((sub: string) => (
                                          <label key={sub} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${teacherAssignSubjects.includes(sub) ? "#3d2c8d" : "var(--rule)"}`, background: teacherAssignSubjects.includes(sub) ? "#e8e4fb" : "var(--pane)" }}>
                                            <input type="checkbox" checked={teacherAssignSubjects.includes(sub)} onChange={e => setTeacherAssignSubjects(v => e.target.checked ? [...v, sub] : v.filter((s: string) => s !== sub))} style={{ display: "none" }} />{sub}
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!teacherAssignClass || !teacherAssignSection || !teacherAssignSubjects.length}
                                  onClick={() => {
                                    // Stage the new assignment into draft — doesn't call API yet
                                    setMgdTeacherForm(v => ({
                                      ...v,
                                      assignments: [...v.assignments, { class: teacherAssignClass, section: teacherAssignSection, subjects: [...teacherAssignSubjects] }]
                                    }));
                                    setTeacherAssignClass(""); setTeacherAssignSection(""); setTeacherAssignSubjects([]);
                                  }}
                                >+ Add Assignment</Button>
                              </div>

                              {/* ── Single Save + Cancel ── */}
                              <div style={{ display: "flex", gap: 8 }}>
                                <Button onClick={() => {
                                  const errs: any = {};
                                  if (!mgdTeacherForm.teacherName.trim()) errs.teacherName = "Name required";
                                  if (!mgdTeacherForm.employeeId.trim()) errs.employeeId = "Employee ID required";
                                  if (!errs.employeeId) {
                                    const dup = (mgdTeacherList || []).find((d: any) => d.employeeId === mgdTeacherForm.employeeId && d.id !== t.id);
                                    if (dup) errs.employeeId = "Employee ID already exists";
                                  }
                                  if (Object.keys(errs).length) { setMgdTeacherErrors(errs); return; }
                                  setMgdTeacherErrors({});
                                  updateMgdTeacherMut.mutate({ id: t.id, ...mgdTeacherForm });
                                }}>Save Changes</Button>
                                <Button variant="outline" onClick={() => { setEditingMgdTeacher(null); setMgdTeacherErrors({}); }}>Cancel</Button>
                              </div>

                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── DELETE MODAL ── */}
        {deleteConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div style={{ background: "white", borderRadius: 14, padding: "24px 28px", maxWidth: 380, width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Confirm Delete</div>
              <div style={{ fontSize: 13, color: "var(--mid)", marginBottom: 16 }}>
                {deleteConfirm.extra?.deleteSubject ? `Delete subject "${deleteConfirm.extra.deleteSubject}" from this class?` : deleteConfirm.extra?.deleteSubjectOnly ? "Remove subject assignment?" : "Delete this record permanently? This cannot be undone."}
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "var(--mid)", marginBottom: 4 }}>Enter Admin Password to Confirm</div>
                <Input type="password" placeholder="Admin password" value={deletePassword} onChange={e => { setDeletePassword(e.target.value); setDeleteError(""); }} onKeyDown={e => { if (e.key === "Enter") handleDeleteConfirm(); }} />
                {deleteError && <div style={{ fontSize: 11, color: "#d94f4f", marginTop: 4 }}>{deleteError}</div>}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button variant="outline" onClick={() => { setDeleteConfirm(null); setDeletePassword(""); setDeleteError(""); }}>Cancel</Button>
                <Button onClick={handleDeleteConfirm} style={{ background: "#d94f4f", color: "white" }}>Delete</Button>
              </div>
            </div>
          </div>
        )}

        {bulkDotMenu !== null && <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => setBulkDotMenu(null)} />}

        {activeSection === "custom-insights" && (
          <div className="sf-panel">
            <CustomInsights role="admin" />
          </div>
        )}

        <ProfileDrawer open={isProfilePanelOpen} onClose={() => setIsProfilePanelOpen(false)} />
      </div>

      {/* ── AI CHAT ── */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsChatOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.18)", backdropFilter: "blur(4px)", zIndex: 40 }} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 20 }} style={{ position: "fixed", right: 0, top: 0, height: "100vh", width: 420, background: "#f5f3ee", zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(26,26,46,0.12)" }}>
              <div style={{ background: "#1a1a2e", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>⏱ AI Analyst</span>
                <button onClick={() => setIsChatOpen(false)} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.6)", fontSize: 14 }}>✕</button>
              </div>
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
                {!activeConversationId ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
                    <div style={{ background: "#dddaf5", padding: "28px 28px 24px", textAlign: "center" }}>
                      <div style={{ width: 60, height: 60, borderRadius: 16, background: "#f5f3ee", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 12px rgba(26,26,46,0.1)" }}>
                        <TrendingUp style={{ width: 26, height: 26, color: "#1a1a2e" }} />
                      </div>
                      <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: 22, color: "#1a1a2e", marginBottom: 8, lineHeight: 1.2 }}>School-Wide Analysis</h2>
                      <p style={{ fontSize: 13.5, color: "#6b6b85", lineHeight: 1.55, maxWidth: 280, margin: "0 auto" }}>Ask any question about school performance, teacher effectiveness, or student trends.</p>
                    </div>
                    <div style={{ background: "#dddaf5", padding: "0 28px 20px", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                      {["School", "Teachers", "Students", "Classes"].map(p => (<span key={p} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 20, background: "rgba(26,26,46,0.08)", color: "#4a4a7a" }}>{p}</span>))}
                    </div>
                    <div style={{ padding: "20px 24px 24px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8888a8", marginBottom: 12 }}>Example Questions</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                        {ADMIN_CHAT_QUESTIONS.map(q => (<button key={q} onClick={() => { startConversation.mutate(undefined, { onSuccess: () => setTimeout(() => setChatMessage(q), 300) }); }} style={{ background: "white", border: "1.5px solid rgba(26,26,46,0.1)", borderRadius: 12, padding: "13px 16px", textAlign: "left", fontFamily: "DM Sans, sans-serif", fontSize: 13.5, color: "#1a1a2e", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, lineHeight: 1.4, transition: "all 0.18s" }}><span style={{ width: 6, height: 6, borderRadius: "50%", border: "1.5px solid #4a4a7a", background: "#dddaf5", flexShrink: 0 }} />{q}</button>))}
                      </div>
                      <button onClick={() => startConversation.mutate()} disabled={startConversation.isPending} style={{ width: "100%", background: "#1a1a2e", color: "white", border: "none", borderRadius: 12, padding: "15px 20px", fontFamily: "DM Sans, sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all 0.2s" }}>
                        {startConversation.isPending ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 16, height: 16 }} />} Start New Analysis
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12, minHeight: 0, background: "#f8f7fd" }}>
                      {(!messages || messages.length === 0) && <div style={{ textAlign: "center", padding: "32px 0", color: "#8888a8", fontSize: 13 }}>Ask a question to get started</div>}
                      {messages?.map((msg: any) => (
                        <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 8, alignItems: "flex-end" }}>
                          {msg.role === "assistant" && <div style={{ width: 26, height: 26, borderRadius: 7, background: "#3D2C8D", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✦</div>}
                          <div style={{ maxWidth: "80%", padding: "9px 13px", borderRadius: 10, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", ...(msg.role === "user" ? { background: "#4a4a7a", color: "white", borderBottomRightRadius: 3 } : { background: "white", color: "#1a1a2e", border: "1px solid #E0DCF0", borderBottomLeftRadius: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }) }}>{msg.content}</div>
                        </div>
                      ))}
                      {sendMessage.isPending && <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}><div style={{ width: 26, height: 26, borderRadius: 7, background: "#3D2C8D", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>✦</div><div style={{ background: "white", border: "1px solid #E0DCF0", borderRadius: "10px 10px 10px 3px", padding: "9px 13px", fontSize: 13, color: "#8888a8" }}>Analyzing data…</div></div>}
                    </div>
                    <div style={{ padding: "12px 16px", borderTop: "1px solid #E0DCF0", background: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                      <div style={{ marginBottom: 8 }}><button onClick={() => setActiveConversationId(null)} style={{ fontSize: 12, color: "#8888a8", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Plus style={{ width: 12, height: 12 }} /> New conversation</button></div>
                      <form onSubmit={e => { e.preventDefault(); if (chatMessage.trim()) sendMessage.mutate(chatMessage); }} style={{ display: "flex", gap: 8 }}>
                        <input placeholder="Ask about school performance…" value={chatMessage} onChange={e => setChatMessage(e.target.value)} disabled={sendMessage.isPending} style={{ flex: 1, border: "1px solid #E0DCF0", borderRadius: 7, padding: "7px 11px", fontSize: 13, fontFamily: "DM Sans, sans-serif", background: "white", color: "#1a1a2e", outline: "none" }} data-testid="input-chat-message" />
                        <button type="submit" disabled={sendMessage.isPending || !chatMessage.trim()} style={{ width: 32, height: 32, borderRadius: 7, background: "#1a1a2e", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 15, flexShrink: 0 }} data-testid="button-send-message">↑</button>
                      </form>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}

/*
File Purpose:
This file is the primary admin dashboard page entrypoint and integration surface.

Responsibilities:

* Renders admin-facing governance, roster, overview, and insights flows
* Coordinates page-level state, data fetching, edits, and bulk operations for admin workflows
* Acts as the compatibility entrypoint while modular admin files are introduced

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
