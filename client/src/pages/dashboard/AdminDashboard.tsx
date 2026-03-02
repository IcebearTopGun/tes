import "@/dashboard.css";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X, MessageSquare, TrendingUp, Send, Plus, ChevronDown, ChevronUp, Pencil, Trash2, BookOpen, School } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { fetchWithAuth } from "@/lib/fetcher";
import ProfileDrawer from "@/components/ProfileDrawer";
import CustomInsights from "@/components/CustomInsights";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function kpiColor(score: number) {
  if (score >= 75) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
}

const ADMIN_CHAT_QUESTIONS = [
  "Which class needs academic intervention?",
  "Who is the most effective teacher this term?",
  "Which subject shows the weakest school performance?",
  "How is homework completion trending across classes?",
  "Which students are at risk of underperformance?",
];

const BAR_COLORS = [
  { bg: "var(--lav-card)", border: "" },
  { bg: "var(--green-bg)", border: "1.5px solid rgba(42,157,110,.3)" },
  { bg: "var(--amber-bg)", border: "1.5px solid rgba(196,122,30,.3)" },
  { bg: "var(--blue-bg)", border: "1.5px solid rgba(37,99,192,.2)" },
  { bg: "#fce4ef", border: "1.5px solid rgba(212,65,126,.2)" },
];

type TeacherRecord = {
  id: number;
  employeeId: string;
  name: string;
  phone: string;
  email?: string | null;
  subjectsAssigned?: string | null;
  classesAssigned?: string | null;
  isClassTeacher?: number | null;
  classTeacherOf?: string | null;
};

type StudentRecord = {
  id: number;
  admissionNumber: string;
  name: string;
  phone: string;
  studentClass: string;
  section: string;
};

type ClassRecord = {
  id: number;
  name: string;
  section: string;
  description?: string | null;
  classTeacherId?: number | null;
  classTeacherName?: string | null;
};

type SubjectRecord = {
  id: number;
  name: string;
  code?: string | null;
  description?: string | null;
  className?: string | null;
  section?: string | null;
  teacherId?: number | null;
  teacherName?: string | null;
};

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState("mgd-classes");
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

  // ─── New managed tables state ─────────────────────────────────────────────
  const [showAddClassSection, setShowAddClassSection] = useState(false);
  const [editingClassSection, setEditingClassSection] = useState<any>(null);
  const [classSectionForm, setClassSectionForm] = useState({ className: "", section: "", subjects: [] as string[] });
  const [classSectionErrors, setClassSectionErrors] = useState<any>({});

  const [showAddMgdStudent, setShowAddMgdStudent] = useState(false);
  const [editingMgdStudent, setEditingMgdStudent] = useState<any>(null);
  const [mgdStudentForm, setMgdStudentForm] = useState({ studentName: "", phoneNumber: "", email: "", admissionNumber: "", class: "", section: "", sessionYear: "" });
  const [mgdStudentErrors, setMgdStudentErrors] = useState<any>({});

  const [showAddMgdTeacher, setShowAddMgdTeacher] = useState(false);
  const [editingMgdTeacher, setEditingMgdTeacher] = useState<any>(null);
  const [mgdTeacherForm, setMgdTeacherForm] = useState({ teacherName: "", employeeId: "", email: "", phoneNumber: "", assignments: [] as any[], isClassTeacher: false, classTeacherOf: "" });
  const [mgdTeacherErrors, setMgdTeacherErrors] = useState<any>({});
  const [teacherAssignClass, setTeacherAssignClass] = useState("");
  const [teacherAssignSection, setTeacherAssignSection] = useState("");
  const [teacherAssignSubjects, setTeacherAssignSubjects] = useState<string[]>([]);

  // ─── Delete confirmation state ────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: number; extra?: any } | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  // ─── Bulk upload state ────────────────────────────────────────────────────
  const [bulkUploadType, setBulkUploadType] = useState<string | null>(null);
  const [bulkUploadResult, setBulkUploadResult] = useState<{ created: number; duplicates: string[] } | null>(null);
  const [bulkDotMenu, setBulkDotMenu] = useState<number | null>(null);

  // Add/Edit modal state
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

  // Validation error states
  const [teacherErrors, setTeacherErrors] = useState<Record<string, string>>({});
  const [studentErrors, setStudentErrors] = useState<Record<string, string>>({});
  const [classErrors, setClassErrors] = useState<Record<string, string>>({});
  const [subjectErrors, setSubjectErrors] = useState<Record<string, string>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const avaRef = useRef<HTMLDivElement>(null);

  const { data: kpis, isLoading: kpisLoading } = useQuery<any>({
    queryKey: ["/api/admin/kpis"],
    queryFn: () => fetchWithAuth("/api/admin/kpis").then(r => r.json()),
    staleTime: 60000,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<any>({
    queryKey: ["/api/admin/analytics"],
    queryFn: () => fetchWithAuth("/api/admin/analytics").then(r => r.json()),
    enabled: true,
    staleTime: 60000,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/admin/stats"],
    queryFn: () => fetchWithAuth("/api/admin/stats").then(r => r.json()),
    staleTime: 60000,
  });

  const { data: studentList, isLoading: studentsLoading } = useQuery<StudentRecord[]>({
    queryKey: ["/api/admin/students"],
    queryFn: () => fetchWithAuth("/api/admin/students").then(r => r.json()),
    enabled: activeSection === "students",
    staleTime: 60000,
  });

  const { data: teacherList, isLoading: teachersLoading } = useQuery<TeacherRecord[]>({
    queryKey: ["/api/admin/teachers"],
    queryFn: () => fetchWithAuth("/api/admin/teachers").then(r => r.json()),
    staleTime: 60000,
  });

  const { data: adminEW, isLoading: adminEWLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/early-warning"],
    queryFn: () => fetchWithAuth("/api/admin/early-warning").then(r => r.json()),
    enabled: activeSection === "early-warning",
    staleTime: 60000,
  });

  const { data: adminQQ, isLoading: adminQQLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/question-quality"],
    queryFn: () => fetchWithAuth("/api/admin/question-quality").then(r => r.json()),
    enabled: activeSection === "question-quality",
    staleTime: 60000,
  });

  const { data: classList, isLoading: classesLoading } = useQuery<ClassRecord[]>({
    queryKey: ["/api/admin/classes"],
    queryFn: () => fetchWithAuth("/api/admin/classes").then(r => r.json()),
    staleTime: 60000,
  });

  const { data: subjectList, isLoading: subjectsLoading } = useQuery<SubjectRecord[]>({
    queryKey: ["/api/admin/subjects"],
    queryFn: () => fetchWithAuth("/api/admin/subjects").then(r => r.json()),
    staleTime: 60000,
  });

  // ── CRUD Mutations ──
  const addTeacherMut = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetchWithAuth("/api/admin/teachers", { method: "POST", body: JSON.stringify(data) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.message || "Failed to create teacher");
      return json;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] }); setShowAddTeacher(false); setTeacherForm({ employeeId: "", name: "", phone: "" }); setTeacherErrors({}); },
    onError: (err: any) => { setTeacherErrors({ employeeId: err.message }); },
  });
  const updateTeacherMut = useMutation({
    mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/teachers/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] }); setEditingTeacher(null); },
  });
  const deleteTeacherMut = useMutation({
    mutationFn: (id: number) => fetchWithAuth(`/api/admin/teachers/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] }); },
  });

  const addStudentMut = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetchWithAuth("/api/admin/students", { method: "POST", body: JSON.stringify(data) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.message || "Failed to create student");
      return json;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] }); setShowAddStudent(false); setStudentForm({ admissionNumber: "", name: "", phone: "", studentClass: "9", section: "A" }); setStudentErrors({}); },
    onError: (err: any) => { setStudentErrors({ admissionNumber: err.message }); },
  });
  const updateStudentMut = useMutation({
    mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/students/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] }); setEditingStudent(null); },
  });
  const deleteStudentMut = useMutation({
    mutationFn: (id: number) => fetchWithAuth(`/api/admin/students/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] }); },
  });

  const addClassMut = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetchWithAuth("/api/admin/classes", { method: "POST", body: JSON.stringify(data) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.message || "Failed to create class");
      return json;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/classes"] }); setShowAddClass(false); setClassForm({ name: "", section: "", description: "", classTeacherId: "" }); setClassErrors({}); },
    onError: (err: any) => { setClassErrors({ section: err.message }); },
  });
  const updateClassMut = useMutation({
    mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/classes/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/classes"] }); setEditingClass(null); },
  });
  const deleteClassMut = useMutation({
    mutationFn: (id: number) => fetchWithAuth(`/api/admin/classes/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/classes"] }); },
  });

  const addSubjectMut = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetchWithAuth("/api/admin/subjects", { method: "POST", body: JSON.stringify(data) });
      const json = await r.json();
      if (!r.ok) throw new Error(json.message || "Failed to create subject");
      return json;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/subjects"] }); setShowAddSubject(false); setSubjectForm({ name: "", code: "", description: "", className: "", section: "", teacherId: "" }); setSubjectErrors({}); },
    onError: (err: any) => { setSubjectErrors({ name: err.message }); },
  });
  const updateSubjectMut = useMutation({
    mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/subjects/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/subjects"] }); setEditingSubject(null); },
  });
  const deleteSubjectMut = useMutation({
    mutationFn: (id: number) => fetchWithAuth(`/api/admin/subjects/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/subjects"] }); },
  });

  // ─── New managed table queries/mutations ──────────────────────────────────
  const { data: classSectionList, isLoading: classSectionsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/class-sections"],
    queryFn: () => fetchWithAuth("/api/admin/class-sections").then(r => r.json()),
  });

  const addClassSectionMut = useMutation({
    mutationFn: (data: any) => fetchWithAuth("/api/admin/class-sections", { method: "POST", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/class-sections"] }); setShowAddClassSection(false); setEditingClassSection(null); },
  });

  const updateClassSectionMut = useMutation({
    mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/class-sections/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/class-sections"] }); setEditingClassSection(null); },
  });

  const deleteClassSectionMut = useMutation({
    mutationFn: ({ id, password, deleteSubject }: any) => fetchWithAuth(`/api/admin/class-sections/${id}`, { method: "DELETE", body: JSON.stringify({ password, deleteSubject }) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/class-sections"] }); setDeleteConfirm(null); setDeletePassword(""); },
    onError: () => { setDeleteError("Incorrect password or operation failed"); },
  });

  const bulkUploadClassSectionsMut = useMutation({
    mutationFn: (records: any[]) => fetchWithAuth("/api/admin/class-sections/bulk-upload", { method: "POST", body: JSON.stringify({ records }) }).then(r => r.json()),
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ["/api/admin/class-sections"] }); setBulkUploadResult(data); },
  });

  const { data: mgdStudentList, isLoading: mgdStudentsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/managed-students"],
    queryFn: () => fetchWithAuth("/api/admin/managed-students").then(r => r.json()),
  });

  const addMgdStudentMut = useMutation({
    mutationFn: (data: any) => fetchWithAuth("/api/admin/managed-students", { method: "POST", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-students"] }); setShowAddMgdStudent(false); setEditingMgdStudent(null); },
  });

  const updateMgdStudentMut = useMutation({
    mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/managed-students/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-students"] }); setEditingMgdStudent(null); },
  });

  const deleteMgdStudentMut = useMutation({
    mutationFn: ({ id, password }: any) => fetchWithAuth(`/api/admin/managed-students/${id}`, { method: "DELETE", body: JSON.stringify({ password }) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-students"] }); setDeleteConfirm(null); setDeletePassword(""); },
    onError: () => { setDeleteError("Incorrect password or operation failed"); },
  });

  const bulkUploadMgdStudentsMut = useMutation({
    mutationFn: (records: any[]) => fetchWithAuth("/api/admin/managed-students/bulk-upload", { method: "POST", body: JSON.stringify({ records }) }).then(r => r.json()),
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-students"] }); setBulkUploadResult(data); },
  });

  const { data: mgdTeacherList, isLoading: mgdTeachersLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/managed-teachers"],
    queryFn: () => fetchWithAuth("/api/admin/managed-teachers").then(r => r.json()),
  });

  const addMgdTeacherMut = useMutation({
    mutationFn: (data: any) => fetchWithAuth("/api/admin/managed-teachers", { method: "POST", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-teachers"] }); setShowAddMgdTeacher(false); setEditingMgdTeacher(null); },
  });

  const updateMgdTeacherMut = useMutation({
    mutationFn: ({ id, ...data }: any) => fetchWithAuth(`/api/admin/managed-teachers/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-teachers"] }); setEditingMgdTeacher(null); },
  });

  const deleteMgdTeacherMut = useMutation({
    mutationFn: ({ id, password, deleteSubjectOnly, className, section, subject }: any) => fetchWithAuth(`/api/admin/managed-teachers/${id}`, { method: "DELETE", body: JSON.stringify({ password, deleteSubjectOnly, className, section, subject }) }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-teachers"] }); setDeleteConfirm(null); setDeletePassword(""); },
    onError: () => { setDeleteError("Incorrect password or operation failed"); },
  });

  const bulkUploadMgdTeachersMut = useMutation({
    mutationFn: (records: any[]) => fetchWithAuth("/api/admin/managed-teachers/bulk-upload", { method: "POST", body: JSON.stringify({ records }) }).then(r => r.json()),
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ["/api/admin/managed-teachers"] }); setBulkUploadResult(data); },
  });

  // ─── Delete confirm helpers ───────────────────────────────────────────────
  const handleDeleteConfirm = () => {
    if (!deleteConfirm || !deletePassword) { setDeleteError("Password required"); return; }
    setDeleteError("");
    const { type, id, extra } = deleteConfirm;
    if (type === "classSection") deleteClassSectionMut.mutate({ id, password: deletePassword, deleteSubject: extra?.deleteSubject });
    else if (type === "mgdStudent") deleteMgdStudentMut.mutate({ id, password: deletePassword });
    else if (type === "mgdTeacher") deleteMgdTeacherMut.mutate({ id, password: deletePassword, ...(extra || {}) });
  };

  // ─── XLSX bulk upload helper ──────────────────────────────────────────────
  const handleExcelUpload = (file: File, type: string) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // Parse CSV-like structure (tab separated or comma separated)
        const text = e.target?.result as string;
        const lines = text.split("\n").filter(l => l.trim());
        if (lines.length < 2) return;
        const headers = lines[0].split("\t").map(h => h.trim().replace(/"/g,""));
        const records = lines.slice(1).map(line => {
          const cols = line.split("\t").map(c => c.trim().replace(/"/g,""));
          const obj: any = {};
          headers.forEach((h, i) => { obj[h] = cols[i] || ""; });
          return obj;
        });
        if (type === "classSection") bulkUploadClassSectionsMut.mutate(records);
        else if (type === "mgdStudent") bulkUploadMgdStudentsMut.mutate(records);
        else if (type === "mgdTeacher") bulkUploadMgdTeachersMut.mutate(records);
      } catch (err) { console.error(err); }
    };
    reader.readAsText(file);
  };

  const downloadTemplate = (type: string) => {
    const templates: Record<string, string> = {
      classSection: "class\tsection\tsubjects\n5\tA\tEnglish,Maths,Science\n6\tB\tHindi,Maths",
      mgdStudent: "studentName\tphoneNumber\temail\tadmissionNumber\tclass\tsection\tsessionYear\nRahul Sharma\t9876543210\trahul@school.edu\t2024001\t5\tA\t2024-2025",
      mgdTeacher: "teacherName\temployeeId\temail\tphoneNumber\tclass\tsection\tsubjects\tisClassTeacher\nRamesh Singh\tT100\tramesh@school.edu\t9876543210\t5\tA\tEnglish,Maths\tfalse",
    };
    const content = templates[type] || "";
    const blob = new Blob([content], { type: "text/tab-separated-values" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `template_${type}.tsv`; a.click();
    URL.revokeObjectURL(url);
  };

  const { data: messages, refetch: refetchMessages } = useQuery<any[]>({
    queryKey: ["/api/chat/messages", activeConversationId],
    queryFn: () => fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`).then(r => r.json()),
    enabled: !!activeConversationId,
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (avaRef.current && !avaRef.current.contains(e.target as Node)) setShowAvaMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const startConversation = useMutation({
    mutationFn: () => fetchWithAuth("/api/chat/conversations", { method: "POST", body: JSON.stringify({ title: "School Analysis" }) }).then(r => r.json()),
    onSuccess: (d) => { setActiveConversationId(d.id); queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] }); },
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) => fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`, { method: "POST", body: JSON.stringify({ content }) }).then(r => r.json()),
    onSuccess: () => { setChatMessage(""); refetchMessages(); },
  });

  const userName = (user as any)?.name || "Admin";
  const initials = getInitials(userName);

  // Compute chart data from analytics
  const classPerf = analytics?.classPerformance || [];
  const subjPerf = analytics?.subjectPerformance || [];
  const teacherStats = analytics?.teacherStats || [];
  const marksDistribution = analytics?.marksDistribution || [];

  // Filter charts
  const filteredClassPerf = classFilter
    ? classPerf.filter((c: any) => `${c.className}${c.section}` === classFilter || c.className === classFilter)
    : classPerf;
  const filteredSubjPerf = subjectFilter
    ? subjPerf.filter((s: any) => s.subject === subjectFilter)
    : subjPerf;

  const classOptions = [...new Set(classPerf.map((c: any) => `${c.className}${c.section}`))];
  const subjectOptions = [...new Set(subjPerf.map((s: any) => s.subject))];

  const maxBarHeight = 100;
  const classBars = filteredClassPerf.slice(0, 8).map((c: any, i: number) => ({
    label: `${c.className}${c.section}`,
    pct: c.avgPct,
    height: Math.round((c.avgPct / 100) * maxBarHeight),
    color: BAR_COLORS[i % BAR_COLORS.length],
  }));
  const subjBars = filteredSubjPerf.map((s: any, i: number) => ({
    label: s.subject.slice(0, 4),
    pct: s.avgPct,
    height: Math.round((s.avgPct / 100) * maxBarHeight),
    color: BAR_COLORS[(i + 2) % BAR_COLORS.length],
  }));

  const totalDistCount = marksDistribution.reduce((s: number, d: any) => s + d.count, 0);
  const distParts = [
    { label: "76–100%", color: "var(--green)", pct: totalDistCount ? Math.round((marksDistribution.find((d: any) => d.range === "76–100%")?.count || 0) / totalDistCount * 100) : 25 },
    { label: "51–75%", color: "var(--amber)", pct: totalDistCount ? Math.round((marksDistribution.find((d: any) => d.range === "51–75%")?.count || 0) / totalDistCount * 100) : 35 },
    { label: "26–50%", color: "var(--lavender)", pct: totalDistCount ? Math.round((marksDistribution.find((d: any) => d.range === "26–50%")?.count || 0) / totalDistCount * 100) : 25 },
    { label: "0–25%", color: "var(--red)", pct: totalDistCount ? Math.round((marksDistribution.find((d: any) => d.range === "0–25%")?.count || 0) / totalDistCount * 100) : 15 },
  ];
  const circumference = 2 * Math.PI * 38;
  let donutOffset = 0;
  const donutSegments = distParts.map(d => {
    const dash = (d.pct / 100) * circumference;
    const seg = { ...d, dash, dashOffset: -donutOffset };
    donutOffset += dash;
    return seg;
  });

  if (kpisLoading && !kpis) {
    return (
      <div className="sf-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="sf-root">
      {/* TOP NAV — exact TeacherDashboard structure */}
      <nav className="sf-topnav">
        <div className="sf-logo">
          <div className="sf-logo-mark teacher" style={{ background: "var(--ink)" }}>A</div>
          <span className="sf-logo-name">ScholarFlow</span>
          <span className="sf-teacher-pill" style={{ background: "var(--ink)", color: "var(--white)", border: "none" }}>ADMIN</span>
        </div>

        <div className="sf-nav-tabs">







          <button className={`sf-nav-tab${activeSection === "mgd-classes" ? " on" : ""}`} onClick={() => setActiveSection("mgd-classes")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
            Class & Subjects
          </button>
          <button className={`sf-nav-tab${activeSection === "mgd-students" ? " on" : ""}`} onClick={() => setActiveSection("mgd-students")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Mgd Students
          </button>
          <button className={`sf-nav-tab${activeSection === "mgd-teachers" ? " on" : ""}`} onClick={() => setActiveSection("mgd-teachers")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            Mgd Teachers
          </button>
          <button className={`sf-nav-tab${activeSection === "custom-insights" ? " on" : ""}`} onClick={() => setActiveSection("custom-insights")}>
            <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            Custom Insights
          </button>

        </div>

        <div className="sf-nav-right">
          <div className="sf-ic-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <button className="sf-btn-analyst" onClick={() => setIsChatOpen(true)} data-testid="button-ai-analyst">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
            </svg>
            AI Analyst
          </button>
          <div className="sf-ava teacher" ref={avaRef} onClick={() => setShowAvaMenu(v => !v)} data-testid="button-avatar">
            {initials}
            {showAvaMenu && (
              <div className="sf-ava-menu">
                <button className="sf-ava-menu-item" onClick={() => { setIsProfilePanelOpen(true); setShowAvaMenu(false); }}>My Profile</button>
                <button className="sf-ava-menu-item danger" onClick={() => logout()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* PAGE */}
      <div className="sf-page">
        <div className="sf-page-head">
          <div>
            <div className="sf-page-title">{getGreeting()}, {userName.split(" ")[0]}.</div>
            <div className="sf-page-sub">{new Date().toDateString()} &nbsp;·&nbsp; School-wide governance, analytics and intelligence</div>
          </div>
        </div>

        {/* 6 AI-DRIVEN KPIs — using sf-funnel with 3-col grid */}
        <div className="sf-funnel" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="sf-f-col" data-testid="kpi-health">
            <div className="sf-f-cat">School Academic Health</div>
            <div className="sf-f-num" style={{ color: kpis ? kpiColor(kpis.healthScore) : undefined }}>
              {kpis ? `${kpis.healthScore}` : "–"}
              {kpis && <span style={{ fontSize: 20, marginLeft: 4, fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: kpis.healthGrade === "A" ? "var(--green-bg)" : kpis.healthGrade === "B" ? "var(--amber-bg)" : "var(--red-bg)", color: kpis.healthGrade === "A" ? "var(--green)" : kpis.healthGrade === "B" ? "var(--amber)" : "var(--red)" }}>{kpis.healthGrade}</span>}
            </div>
            <div className={`sf-f-delta ${kpis?.healthScore >= 65 ? "sf-d-up" : "sf-d-flat"}`}>
              {kpis ? (kpis.healthScore >= 65 ? `↑ Grade ${kpis.healthGrade}` : `→ Needs focus`) : "Loading"}
            </div>
            <div className="sf-f-desc">Composite of performance, engagement and teacher effectiveness.</div>
          </div>

          <div className="sf-f-col" data-testid="kpi-improvement">
            <div className="sf-f-cat">Academic Improvement</div>
            <div className="sf-f-num" style={{ color: kpis ? kpiColor(kpis.improvementIndex) : undefined }}>
              {kpis ? `${kpis.improvementIndex}%` : "–"}
            </div>
            <div className={`sf-f-delta ${kpis?.improvementIndex >= 50 ? "sf-d-up" : "sf-d-flat"}`}>
              {kpis ? `${kpis.improvementCount} of ${kpis.improvementTotal} students` : "Loading"}
            </div>
            <div className="sf-f-desc">Students whose latest exam score exceeds their first attempt.</div>
          </div>

          <div className="sf-f-col" data-testid="kpi-intervention">
            <div className="sf-f-cat">Require Intervention</div>
            <div className="sf-f-num" style={{ color: kpis?.interventionCount > 0 ? "var(--red)" : "var(--green)" }}>
              {kpis ? kpis.interventionCount : "–"}
            </div>
            <div className={`sf-f-delta ${kpis?.interventionCount === 0 ? "sf-d-up" : "sf-d-flat"}`}>
              {kpis ? (kpis.interventionCount === 0 ? "↑ All above 50%" : `→ Avg below 50%`) : "Loading"}
            </div>
            <div className="sf-f-desc">Students with overall average below 50% across all exams.</div>
          </div>

          <div className="sf-f-col" data-testid="kpi-teacher">
            <div className="sf-f-cat">Teacher Effectiveness</div>
            <div className="sf-f-num" style={{ color: kpis ? kpiColor(kpis.teacherEffectivenessScore) : undefined }}>
              {kpis ? `${kpis.teacherEffectivenessScore}` : "–"}
            </div>
            <div className={`sf-f-delta ${kpis?.teacherEffectivenessScore >= 70 ? "sf-d-up" : "sf-d-flat"}`}>
              {kpis ? (kpis.teacherEffectivenessScore >= 70 ? "↑ Consistent outcomes" : "→ Variation detected") : "Loading"}
            </div>
            <div className="sf-f-desc">Score based on consistency of class performance across teachers.</div>
          </div>

          <div className="sf-f-col" data-testid="kpi-engagement">
            <div className="sf-f-cat">Learning Engagement</div>
            <div className="sf-f-num" style={{ color: kpis ? kpiColor(kpis.engagementIndex) : undefined }}>
              {kpis ? `${kpis.engagementIndex}%` : "–"}
            </div>
            <div className={`sf-f-delta ${kpis?.engagementIndex >= 60 ? "sf-d-up" : "sf-d-flat"}`}>
              {kpis ? (kpis.engagementIndex >= 60 ? "↑ Good participation" : "→ Needs push") : "Loading"}
            </div>
            <div className="sf-f-desc">Homework submission rate across all assigned homework tasks.</div>
          </div>

          <div className="sf-f-col" data-testid="kpi-homework-eff">
            <div className="sf-f-cat">Homework Effectiveness</div>
            <div className="sf-f-num" style={{ color: kpis ? kpiColor(kpis.homeworkEffectivenessIndex) : undefined }}>
              {kpis ? (kpis.homeworkEffectivenessIndex > 0 ? `${kpis.homeworkEffectivenessIndex}%` : "–") : "–"}
            </div>
            <div className="sf-f-delta sf-d-flat">
              {kpis?.homeworkEffectivenessIndex > 0 ? "Correctness score avg" : "→ No submissions yet"}
            </div>
            <div className="sf-f-desc">Average correctness score from AI-graded homework submissions.</div>
          </div>
        </div>

        {/* SECTION TABS */}


        {/* ── CLASS & SUBJECTS MANAGEMENT TAB ── */}
        {activeSection === "mgd-classes" && (
          <div className="sf-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="sf-panel-title">Class &amp; Subject Management</div>
                <div className="sf-panel-sub">Manage class sections and their subject assignments</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="outline" onClick={() => downloadTemplate("classSection")} style={{ fontSize: 12 }}>
                  ⬇ Download Template
                </Button>
                <label style={{ cursor: "pointer" }}>
                  <span style={{ fontSize: 12, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", display: "inline-block" }}>⬆ Upload Excel</span>
                  <input type="file" accept=".tsv,.csv,.xlsx" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) handleExcelUpload(e.target.files[0], "classSection"); }} />
                </label>
                <Button onClick={() => { setShowAddClassSection(true); setEditingClassSection(null); setClassSectionForm({ className: "", section: "", subjects: [] }); setClassSectionErrors({}); }}>
                  <Plus size={14} style={{ marginRight: 8 }} /> Add Class
                </Button>
              </div>
            </div>

            {bulkUploadResult && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #86efac", fontSize: 13 }}>
                ✅ Created {bulkUploadResult.created} records.
                {bulkUploadResult.duplicates.length > 0 && ` Duplicates skipped: ${bulkUploadResult.duplicates.join(", ")}`}
                <button onClick={() => setBulkUploadResult(null)} style={{ marginLeft: 12, fontSize: 11, color: "var(--mid)", background: "none", border: "none", cursor: "pointer" }}>Dismiss</button>
              </div>
            )}

            {(showAddClassSection || !!editingClassSection) && (
              <div className="sf-card" style={{ marginTop: 16 }}>
                <div className="sf-card-title">{editingClassSection ? "Edit Class Section" : "Add Class Section"}</div>
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
                      <label key={sub} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${classSectionForm.subjects.includes(sub) ? "var(--ink)" : "var(--rule)"}`, background: classSectionForm.subjects.includes(sub) ? "var(--lav-card)" : "var(--pane)" }}>
                        <input type="checkbox" checked={classSectionForm.subjects.includes(sub)} onChange={e => setClassSectionForm(v => ({ ...v, subjects: e.target.checked ? [...v.subjects, sub] : v.subjects.filter(s => s !== sub) }))} style={{ display: "none" }} />
                        {sub}
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
                    // Duplicate check
                    const dup = (classSectionList || []).find((c: any) => String(c.className) === classSectionForm.className && c.section === classSectionForm.section && (!editingClassSection || c.id !== editingClassSection.id));
                    if (dup) { setClassSectionErrors({ className: `Class ${classSectionForm.className}-${classSectionForm.section} already exists` }); return; }
                    setClassSectionErrors({});
                    const payload = { className: parseInt(classSectionForm.className), section: classSectionForm.section, subjects: classSectionForm.subjects };
                    if (editingClassSection) updateClassSectionMut.mutate({ id: editingClassSection.id, ...payload });
                    else addClassSectionMut.mutate(payload);
                  }}>
                    {editingClassSection ? "Save" : "Create"}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowAddClassSection(false); setEditingClassSection(null); setClassSectionErrors({}); }}>Cancel</Button>
                </div>
              </div>
            )}

            {classSectionsLoading ? (
              <div style={{ textAlign: "center", padding: 32 }}><div className="sf-spinner" /></div>
            ) : !(classSectionList || []).length ? (
              <div className="sf-empty"><div className="sf-empty-icon">🏫</div>No class sections added yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                {(classSectionList || []).map((cs: any) => {
                  const subjects: string[] = (() => { try { return JSON.parse(cs.subjects); } catch { return []; } })();
                  return (
                    <div key={cs.id} className="sf-exam-item" style={{ cursor: "default", padding: "12px 14px", justifyContent: "space-between" }}>
                      <div>
                        <div className="sf-exam-name">Class {cs.className} — Section {cs.section}</div>
                        <div className="sf-exam-meta">{subjects.join(", ") || "No subjects"}</div>
                      </div>
                      <div style={{ position: "relative" }}>
                        <button onClick={() => setBulkDotMenu(bulkDotMenu === cs.id ? null : cs.id)} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", cursor: "pointer", fontSize: 16 }}>⋮</button>
                        {bulkDotMenu === cs.id && (
                          <div style={{ position: "absolute", right: 0, top: 32, background: "white", border: "1px solid var(--rule)", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 100, minWidth: 180 }}>
                            <button onClick={() => { setBulkDotMenu(null); setEditingClassSection(cs); setShowAddClassSection(false); setClassSectionForm({ className: String(cs.className), section: cs.section, subjects }); setClassSectionErrors({}); }} style={{ display: "block", width: "100%", padding: "10px 14px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>✏️ Edit</button>
                            {subjects.map(sub => (
                              <button key={sub} onClick={() => { setBulkDotMenu(null); setDeleteConfirm({ type: "classSection", id: cs.id, extra: { deleteSubject: sub } }); setDeletePassword(""); setDeleteError(""); }} style={{ display: "block", width: "100%", padding: "10px 14px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#c05050" }}>🗑 Delete subject: {sub}</button>
                            ))}
                            <button onClick={() => { setBulkDotMenu(null); setDeleteConfirm({ type: "classSection", id: cs.id }); setDeletePassword(""); setDeleteError(""); }} style={{ display: "block", width: "100%", padding: "10px 14px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#c05050" }}>🗑 Delete entire class</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── MANAGED STUDENTS TAB ── */}
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
                  <span style={{ fontSize: 12, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", display: "inline-block" }}>⬆ Upload Excel</span>
                  <input type="file" accept=".tsv,.csv" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) handleExcelUpload(e.target.files[0], "mgdStudent"); }} />
                </label>
                <Button onClick={() => { setShowAddMgdStudent(true); setEditingMgdStudent(null); setMgdStudentForm({ studentName: "", phoneNumber: "", email: "", admissionNumber: "", class: "", section: "", sessionYear: "" }); setMgdStudentErrors({}); }}>
                  <Plus size={14} style={{ marginRight: 8 }} /> Add Student
                </Button>
              </div>
            </div>

            {bulkUploadResult && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #86efac", fontSize: 13 }}>
                ✅ Created {bulkUploadResult.created} records.
                {bulkUploadResult.duplicates.length > 0 && ` Duplicates (admissionNumber) skipped: ${bulkUploadResult.duplicates.join(", ")}`}
                <button onClick={() => setBulkUploadResult(null)} style={{ marginLeft: 12, fontSize: 11, color: "var(--mid)", background: "none", border: "none", cursor: "pointer" }}>Dismiss</button>
              </div>
            )}

            {(showAddMgdStudent || !!editingMgdStudent) && (
              <div className="sf-card" style={{ marginTop: 16 }}>
                <div className="sf-card-title">{editingMgdStudent ? "Edit Student" : "Add Student"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 12 }}>
                  <div>
                    <Input placeholder="Student Name" value={mgdStudentForm.studentName} onChange={e => setMgdStudentForm(v => ({ ...v, studentName: e.target.value }))} style={{ borderColor: mgdStudentErrors.studentName ? "#d94f4f" : undefined }} />
                    {mgdStudentErrors.studentName && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.studentName}</div>}
                  </div>
                  <Input placeholder="Phone Number" value={mgdStudentForm.phoneNumber} onChange={e => setMgdStudentForm(v => ({ ...v, phoneNumber: e.target.value }))} />
                  <Input placeholder="Email" value={mgdStudentForm.email} onChange={e => setMgdStudentForm(v => ({ ...v, email: e.target.value }))} />
                  <div>
                    <Input placeholder="Admission Number (unique)" value={mgdStudentForm.admissionNumber} onChange={e => setMgdStudentForm(v => ({ ...v, admissionNumber: e.target.value }))} style={{ borderColor: mgdStudentErrors.admissionNumber ? "#d94f4f" : undefined }} />
                    {mgdStudentErrors.admissionNumber && <div style={{ fontSize: 11, color: "#d94f4f" }}>{mgdStudentErrors.admissionNumber}</div>}
                  </div>
                  <Input placeholder="Class" value={mgdStudentForm.class} onChange={e => setMgdStudentForm(v => ({ ...v, class: e.target.value }))} />
                  <Input placeholder="Section" value={mgdStudentForm.section} maxLength={1} onChange={e => setMgdStudentForm(v => ({ ...v, section: e.target.value.toUpperCase() }))} />
                  <Input placeholder="Session Year (e.g. 2024-2025)" value={mgdStudentForm.sessionYear} onChange={e => setMgdStudentForm(v => ({ ...v, sessionYear: e.target.value }))} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Button onClick={() => {
                    const errs: any = {};
                    if (!mgdStudentForm.studentName.trim()) errs.studentName = "Name required";
                    if (!mgdStudentForm.admissionNumber.trim()) errs.admissionNumber = "Admission number required";
                    if (!mgdStudentForm.class.trim()) errs.class = "Class required";
                    if (!mgdStudentForm.section.trim()) errs.section = "Section required";
                    if (!mgdStudentForm.sessionYear.trim()) errs.sessionYear = "Session year required";
                    if (!errs.admissionNumber) {
                      const dup = (mgdStudentList || []).find((s: any) => s.admissionNumber === mgdStudentForm.admissionNumber && (!editingMgdStudent || s.id !== editingMgdStudent.id));
                      if (dup) errs.admissionNumber = "Admission number already exists";
                    }
                    if (Object.keys(errs).length) { setMgdStudentErrors(errs); return; }
                    setMgdStudentErrors({});
                    if (editingMgdStudent) updateMgdStudentMut.mutate({ id: editingMgdStudent.id, ...mgdStudentForm });
                    else addMgdStudentMut.mutate(mgdStudentForm);
                  }}>
                    {editingMgdStudent ? "Save" : "Create"}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowAddMgdStudent(false); setEditingMgdStudent(null); setMgdStudentErrors({}); }}>Cancel</Button>
                </div>
              </div>
            )}

            {mgdStudentsLoading ? (
              <div style={{ textAlign: "center", padding: 32 }}><div className="sf-spinner" /></div>
            ) : !(mgdStudentList || []).length ? (
              <div className="sf-empty"><div className="sf-empty-icon">👨‍🎓</div>No students added yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                {(mgdStudentList || []).map((s: any) => (
                  <div key={s.id} className="sf-exam-item" style={{ cursor: "default", padding: "12px 14px", justifyContent: "space-between" }}>
                    <div>
                      <div className="sf-exam-name">{s.studentName}</div>
                      <div className="sf-exam-meta">Admission: {s.admissionNumber} · Class {s.class}-{s.section} · {s.sessionYear}</div>
                      {s.email && <div className="sf-exam-meta">{s.email}</div>}
                    </div>
                    <div style={{ position: "relative" }}>
                      <button onClick={() => setBulkDotMenu(bulkDotMenu === s.id + 10000 ? null : s.id + 10000)} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", cursor: "pointer", fontSize: 16 }}>⋮</button>
                      {bulkDotMenu === s.id + 10000 && (
                        <div style={{ position: "absolute", right: 0, top: 32, background: "white", border: "1px solid var(--rule)", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 100, minWidth: 140 }}>
                          <button onClick={() => { setBulkDotMenu(null); setEditingMgdStudent(s); setShowAddMgdStudent(false); setMgdStudentForm({ studentName: s.studentName, phoneNumber: s.phoneNumber || "", email: s.email || "", admissionNumber: s.admissionNumber, class: s.class, section: s.section, sessionYear: s.sessionYear }); setMgdStudentErrors({}); }} style={{ display: "block", width: "100%", padding: "10px 14px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>✏️ Edit</button>
                          <button onClick={() => { setBulkDotMenu(null); setDeleteConfirm({ type: "mgdStudent", id: s.id }); setDeletePassword(""); setDeleteError(""); }} style={{ display: "block", width: "100%", padding: "10px 14px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#c05050" }}>🗑 Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MANAGED TEACHERS TAB ── */}
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
                  <span style={{ fontSize: 12, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", display: "inline-block" }}>⬆ Upload Excel</span>
                  <input type="file" accept=".tsv,.csv" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) handleExcelUpload(e.target.files[0], "mgdTeacher"); }} />
                </label>
                <Button onClick={() => { setShowAddMgdTeacher(true); setEditingMgdTeacher(null); setMgdTeacherForm({ teacherName: "", employeeId: "", email: "", phoneNumber: "", assignments: [], isClassTeacher: false, classTeacherOf: "" }); setMgdTeacherErrors({}); setTeacherAssignClass(""); setTeacherAssignSection(""); setTeacherAssignSubjects([]); }}>
                  <Plus size={14} style={{ marginRight: 8 }} /> Add Teacher
                </Button>
              </div>
            </div>

            {bulkUploadResult && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #86efac", fontSize: 13 }}>
                ✅ Created {bulkUploadResult.created} records.
                {bulkUploadResult.duplicates.length > 0 && ` Duplicates skipped: ${bulkUploadResult.duplicates.join(", ")}`}
                <button onClick={() => setBulkUploadResult(null)} style={{ marginLeft: 12, fontSize: 11, color: "var(--mid)", background: "none", border: "none", cursor: "pointer" }}>Dismiss</button>
              </div>
            )}

            {(showAddMgdTeacher || !!editingMgdTeacher) && (() => {
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
                          {Array.from(new Set((classSectionList || []).map((c: any) => String(c.className)))).sort().map(cn => (
                            <option key={cn} value={cn}>Class {cn}</option>
                          ))}
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
                                <input type="checkbox" checked={teacherAssignSubjects.includes(sub)} onChange={e => setTeacherAssignSubjects(v => e.target.checked ? [...v, sub] : v.filter(s => s !== sub))} style={{ display: "none" }} />
                                {sub}
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
                      }}>
                      + Add Assignment
                    </Button>
                    {mgdTeacherForm.assignments.length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                        {mgdTeacherForm.assignments.map((a: any, i: number) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "var(--pane)", borderRadius: 7, fontSize: 12 }}>
                            <span>Class {a.class}-{a.section}: {a.subjects.join(", ")}</span>
                            <button onClick={() => setMgdTeacherForm(v => ({ ...v, assignments: v.assignments.filter((_: any, j: number) => j !== i) }))} style={{ background: "none", border: "none", cursor: "pointer", color: "#c05050", fontSize: 14 }}>×</button>
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
                        {(classSectionList || []).map((c: any) => (
                          <option key={c.id} value={`${c.className}-${c.section}`}>Class {c.className}-{c.section}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <Button onClick={() => {
                      const errs: any = {};
                      if (!mgdTeacherForm.teacherName.trim()) errs.teacherName = "Name required";
                      if (!mgdTeacherForm.employeeId.trim()) errs.employeeId = "Employee ID required";
                      if (!errs.employeeId) {
                        const dup = (mgdTeacherList || []).find((t: any) => t.employeeId === mgdTeacherForm.employeeId && (!editingMgdTeacher || t.id !== editingMgdTeacher.id));
                        if (dup) errs.employeeId = "Employee ID already exists";
                      }
                      if (Object.keys(errs).length) { setMgdTeacherErrors(errs); return; }
                      setMgdTeacherErrors({});
                      if (editingMgdTeacher) updateMgdTeacherMut.mutate({ id: editingMgdTeacher.id, ...mgdTeacherForm });
                      else addMgdTeacherMut.mutate(mgdTeacherForm);
                    }}>
                      {editingMgdTeacher ? "Save" : "Create"}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowAddMgdTeacher(false); setEditingMgdTeacher(null); setMgdTeacherErrors({}); }}>Cancel</Button>
                  </div>
                </div>
              );
            })()}

            {mgdTeachersLoading ? (
              <div style={{ textAlign: "center", padding: 32 }}><div className="sf-spinner" /></div>
            ) : !(mgdTeacherList || []).length ? (
              <div className="sf-empty"><div className="sf-empty-icon">👩‍🏫</div>No teachers added yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                {(mgdTeacherList || []).map((t: any) => {
                  const assignments: any[] = (() => { try { return JSON.parse(t.assignments); } catch { return []; } })();
                  return (
                    <div key={t.id} className="sf-exam-item" style={{ cursor: "default", padding: "12px 14px", justifyContent: "space-between" }}>
                      <div>
                        <div className="sf-exam-name">{t.teacherName} ({t.employeeId})</div>
                        <div className="sf-exam-meta">{t.email || ""}{t.phoneNumber ? ` · ${t.phoneNumber}` : ""}</div>
                        {assignments.map((a: any, i: number) => (
                          <div key={i} className="sf-exam-meta">Class {a.class}-{a.section}: {a.subjects?.join(", ")}</div>
                        ))}
                        {t.isClassTeacher === 1 && <div className="sf-exam-meta" style={{ color: "var(--green)" }}>Class Teacher: {t.classTeacherOf}</div>}
                      </div>
                      <div style={{ position: "relative" }}>
                        <button onClick={() => setBulkDotMenu(bulkDotMenu === t.id + 20000 ? null : t.id + 20000)} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--rule)", background: "var(--pane)", cursor: "pointer", fontSize: 16 }}>⋮</button>
                        {bulkDotMenu === t.id + 20000 && (
                          <div style={{ position: "absolute", right: 0, top: 32, background: "white", border: "1px solid var(--rule)", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 100, minWidth: 200 }}>
                            <button onClick={() => { setBulkDotMenu(null); setEditingMgdTeacher(t); setShowAddMgdTeacher(false); setMgdTeacherForm({ teacherName: t.teacherName, employeeId: t.employeeId, email: t.email || "", phoneNumber: t.phoneNumber || "", assignments, isClassTeacher: t.isClassTeacher === 1, classTeacherOf: t.classTeacherOf || "" }); setMgdTeacherErrors({}); }} style={{ display: "block", width: "100%", padding: "10px 14px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>✏️ Edit</button>
                            {assignments.flatMap((a: any) => (a.subjects || []).map((sub: string) => (
                              <button key={a.class + a.section + sub} onClick={() => { setBulkDotMenu(null); setDeleteConfirm({ type: "mgdTeacher", id: t.id, extra: { deleteSubjectOnly: true, className: a.class, section: a.section, subject: sub } }); setDeletePassword(""); setDeleteError(""); }} style={{ display: "block", width: "100%", padding: "10px 14px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#c05050" }}>🗑 Remove {sub} ({a.class}-{a.section})</button>
                            )))}
                            <button onClick={() => { setBulkDotMenu(null); setDeleteConfirm({ type: "mgdTeacher", id: t.id }); setDeletePassword(""); setDeleteError(""); }} style={{ display: "block", width: "100%", padding: "10px 14px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#c05050" }}>🗑 Delete teacher entirely</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── DELETE CONFIRMATION MODAL ── */}
        {deleteConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
            <div style={{ background: "white", borderRadius: 14, padding: "24px 28px", maxWidth: 380, width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Confirm Delete</div>
              <div style={{ fontSize: 13, color: "var(--mid)", marginBottom: 16 }}>
                {deleteConfirm.extra?.deleteSubject ? `Delete subject "${deleteConfirm.extra.deleteSubject}" from this class?` :
                 deleteConfirm.extra?.deleteSubjectOnly ? `Remove subject assignment?` :
                 "Delete this record permanently?"}
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

        {/* Click outside to close dot menus */}
        {bulkDotMenu !== null && <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setBulkDotMenu(null)} />}

        {/* ── PROFILE TAB ── */}
        {/* ── CUSTOM INSIGHTS TAB ── */}
        {activeSection === "custom-insights" && (
          <div className="sf-panel">
            <CustomInsights role="admin" />
          </div>
        )}

        <ProfileDrawer open={isProfilePanelOpen} onClose={() => setIsProfilePanelOpen(false)} />
      </div>

      {/* ── AI CHAT SIDEBAR ── */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsChatOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.18)", backdropFilter: "blur(4px)", zIndex: 40 }} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 20 }} style={{ position: "fixed", right: 0, top: 0, height: "100vh", width: 420, background: "#f5f3ee", zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(26,26,46,0.12)" }}>
              {/* Top bar — navy */}
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
                      {["School", "Teachers", "Students", "Classes"].map(p => (
                        <span key={p} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 20, background: "rgba(26,26,46,0.08)", color: "#4a4a7a" }}>{p}</span>
                      ))}
                    </div>
                    <div style={{ padding: "20px 24px 24px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8888a8", marginBottom: 12 }}>Example Questions</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                        {ADMIN_CHAT_QUESTIONS.map(q => (
                          <button key={q} onClick={() => { startConversation.mutate(undefined, { onSuccess: () => setTimeout(() => setChatMessage(q), 300) }); }} style={{ background: "white", border: "1.5px solid rgba(26,26,46,0.1)", borderRadius: 12, padding: "13px 16px", textAlign: "left", fontFamily: "DM Sans, sans-serif", fontSize: 13.5, color: "#1a1a2e", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, lineHeight: 1.4, transition: "all 0.18s" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", border: "1.5px solid #4a4a7a", background: "#dddaf5", flexShrink: 0 }} />{q}
                          </button>
                        ))}
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

      {/* Floating chat button */}
      {!isChatOpen && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ position: "fixed", bottom: 24, right: 24, zIndex: 40 }}>
          <button onClick={() => setIsChatOpen(true)} data-testid="button-float-chat" style={{ width: 56, height: 56, borderRadius: "50%", background: "#1a1a2e", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 30px rgba(26,26,46,0.3)", transition: "transform 0.2s" }}>
            <MessageSquare style={{ width: 22, height: 22, color: "white" }} />
          </button>
        </motion.div>
      )}
    </div>
  );
}
