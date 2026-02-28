import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Trash2,
  Pencil,
  Library,
  Loader2,
  BookOpen,
} from "lucide-react";

async function fetchWithAuth(url: string, options?: RequestInit) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.json();
}

interface NcertChapter {
  id: number;
  class: string;
  subject: string;
  chapterName: string;
  chapterContent: string;
}

interface ChapterForm {
  class: string;
  subject: string;
  chapterName: string;
  chapterContent: string;
}

const emptyForm: ChapterForm = { class: "", subject: "", chapterName: "", chapterContent: "" };

export default function NcertChapters() {
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingChapter, setEditingChapter] = useState<NcertChapter | null>(null);
  const [form, setForm] = useState<ChapterForm>(emptyForm);
  const [filterClass, setFilterClass] = useState("");
  const [filterSubject, setFilterSubject] = useState("");

  const { data: chapters, isLoading } = useQuery<NcertChapter[]>({
    queryKey: ["/api/ncert-chapters"],
    queryFn: () => fetchWithAuth("/api/ncert-chapters"),
  });

  const createMutation = useMutation({
    mutationFn: (data: ChapterForm) =>
      fetchWithAuth("/api/ncert-chapters", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ncert-chapters"] });
      toast({ title: "Chapter added", description: "NCERT chapter saved successfully." });
      setIsAddOpen(false);
      setForm(emptyForm);
    },
    onError: () => toast({ title: "Error", description: "Failed to save chapter.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ChapterForm> }) =>
      fetchWithAuth(`/api/ncert-chapters/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ncert-chapters"] });
      toast({ title: "Chapter updated", description: "Changes saved." });
      setEditingChapter(null);
      setForm(emptyForm);
    },
    onError: () => toast({ title: "Error", description: "Failed to update chapter.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchWithAuth(`/api/ncert-chapters/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ncert-chapters"] });
      toast({ title: "Deleted", description: "Chapter removed." });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete chapter.", variant: "destructive" }),
  });

  const openEdit = (chapter: NcertChapter) => {
    setEditingChapter(chapter);
    setForm({
      class: chapter.class,
      subject: chapter.subject,
      chapterName: chapter.chapterName,
      chapterContent: chapter.chapterContent,
    });
  };

  const handleSubmit = () => {
    if (!form.class || !form.subject || !form.chapterName || !form.chapterContent) {
      toast({ title: "Incomplete", description: "All fields are required.", variant: "destructive" });
      return;
    }
    if (editingChapter) {
      updateMutation.mutate({ id: editingChapter.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const filtered = chapters?.filter(ch =>
    (!filterClass || ch.class.toLowerCase().includes(filterClass.toLowerCase())) &&
    (!filterSubject || ch.subject.toLowerCase().includes(filterSubject.toLowerCase()))
  ) ?? [];

  const classes = [...new Set(chapters?.map(c => c.class) ?? [])];
  const subjects = [...new Set(chapters?.map(c => c.subject) ?? [])];

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Library className="h-8 w-8 text-primary" />
              NCERT Chapters
            </h1>
            <p className="text-muted-foreground mt-1">
              Add NCERT chapter content used as reference context during AI evaluation.
            </p>
          </div>
          <Dialog open={isAddOpen} onOpenChange={(o) => { setIsAddOpen(o); if (!o) { setForm(emptyForm); } }}>
            <DialogTrigger asChild>
              <Button className="rounded-xl gap-2" data-testid="button-add-chapter">
                <Plus className="h-4 w-4" /> Add Chapter
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px] rounded-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add NCERT Chapter</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Class</label>
                    <Input
                      placeholder="10"
                      value={form.class}
                      onChange={e => setForm(f => ({ ...f, class: e.target.value }))}
                      className="rounded-xl"
                      data-testid="input-chapter-class"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Subject</label>
                    <Input
                      placeholder="Science"
                      value={form.subject}
                      onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                      className="rounded-xl"
                      data-testid="input-chapter-subject"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Chapter Name</label>
                  <Input
                    placeholder="Life Processes"
                    value={form.chapterName}
                    onChange={e => setForm(f => ({ ...f, chapterName: e.target.value }))}
                    className="rounded-xl"
                    data-testid="input-chapter-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Chapter Content</label>
                  <Textarea
                    placeholder="Key concepts, definitions, and important points from this chapter…"
                    value={form.chapterContent}
                    onChange={e => setForm(f => ({ ...f, chapterContent: e.target.value }))}
                    className="rounded-xl min-h-[160px] text-sm"
                    data-testid="input-chapter-content"
                  />
                  <p className="text-xs text-muted-foreground">
                    This content will be included as AI evaluation context when evaluating exams of this class and subject.
                  </p>
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="w-full rounded-xl"
                  data-testid="button-save-chapter"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Chapter
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <Card className="border-border/40 rounded-2xl">
          <CardContent className="p-4">
            <div className="flex gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Filter by class:</span>
                <select
                  value={filterClass}
                  onChange={e => setFilterClass(e.target.value)}
                  className="text-sm border border-border/40 rounded-lg px-2 py-1 bg-background"
                  data-testid="select-filter-class"
                >
                  <option value="">All classes</option>
                  {classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Subject:</span>
                <select
                  value={filterSubject}
                  onChange={e => setFilterSubject(e.target.value)}
                  className="text-sm border border-border/40 rounded-lg px-2 py-1 bg-background"
                  data-testid="select-filter-subject"
                >
                  <option value="">All subjects</option>
                  {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <Badge variant="secondary" className="rounded-lg border-none">
                {filtered.length} chapter{filtered.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Chapters Table */}
        <Card className="border-border/40 shadow-premium rounded-2xl overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Reference Chapters
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Library className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="font-semibold">No chapters yet</p>
                <p className="text-sm mt-1">Add NCERT chapters to provide context during evaluation.</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent border-border/40">
                    <TableHead className="font-bold">Class</TableHead>
                    <TableHead className="font-bold">Subject</TableHead>
                    <TableHead className="font-bold">Chapter</TableHead>
                    <TableHead className="font-bold">Content Preview</TableHead>
                    <TableHead className="font-bold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((chapter) => (
                    <TableRow key={chapter.id} className="border-border/40 hover:bg-muted/20" data-testid={`row-chapter-${chapter.id}`}>
                      <TableCell>
                        <Badge variant="outline" className="rounded-lg">{chapter.class}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-lg border-primary/20 text-primary">{chapter.subject}</Badge>
                      </TableCell>
                      <TableCell className="font-semibold">{chapter.chapterName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                        {chapter.chapterContent.substring(0, 100)}…
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg gap-1 text-xs"
                            onClick={() => openEdit(chapter)}
                            data-testid={`button-edit-chapter-${chapter.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg gap-1 text-xs text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate(chapter.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-chapter-${chapter.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingChapter} onOpenChange={(o) => { if (!o) { setEditingChapter(null); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-[560px] rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit NCERT Chapter</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Class</label>
                <Input
                  value={form.class}
                  onChange={e => setForm(f => ({ ...f, class: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subject</label>
                <Input
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Chapter Name</label>
              <Input
                value={form.chapterName}
                onChange={e => setForm(f => ({ ...f, chapterName: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Chapter Content</label>
              <Textarea
                value={form.chapterContent}
                onChange={e => setForm(f => ({ ...f, chapterContent: e.target.value }))}
                className="rounded-xl min-h-[160px] text-sm"
              />
            </div>
            <Button
              onClick={handleSubmit}
              disabled={isPending}
              className="w-full rounded-xl"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
