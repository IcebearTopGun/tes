import "@/dashboard.css";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import ProfileDrawer from "@/components/ProfileDrawer";
import StudentTopNav from "@/components/student/StudentTopNav";
import { getInitials } from "@/shared/utils/identity";
import { StudentWorkspaceService } from "@/features/student/services/student-workspace.service";
import { useStudentHomeworkWorkspace } from "@/features/student/homework/hooks/useStudentHomeworkWorkspace";
import { HomeworkStats } from "@/features/student/homework/components/HomeworkStats";
import { PrivateEvaluationQA } from "@/features/student/shared/components/PrivateEvaluationQA";

export default function StudentHomeworkPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [uploadingHwId, setUploadingHwId] = useState<number | null>(null);
  const [pendingHwId, setPendingHwId] = useState<number | null>(null);
  const [chatByHw, setChatByHw] = useState<Record<number, { q: string; a: string; loading: boolean }>>({});
  const hwFileRef = useRef<HTMLInputElement>(null);

  const { homeworkQuery, analyticsQuery, groupedHomework } = useStudentHomeworkWorkspace();
  const homeworkList = homeworkQuery.data;
  const isHomeworkLoading = homeworkQuery.isLoading;

  const submitHomework = useMutation({
    mutationFn: ({ hwId, filesBase64 }: { hwId: number; filesBase64: string[] }) =>
      StudentWorkspaceService.submitHomework(hwId, filesBase64),
    onSuccess: () => {
      toast({ title: "Homework submitted", description: "Your answer sheets were uploaded and evaluated." });
      homeworkQuery.refetch();
      analyticsQuery.refetch();
    },
    onError: (error: Error) =>
      toast({
        title: "Submission failed",
        description: error?.message || "Could not submit homework.",
        variant: "destructive",
      }),
    onSettled: () => {
      setUploadingHwId(null);
      setPendingHwId(null);
    },
  });

  const chatMutation = useMutation({
    mutationFn: ({ hwId, question }: { hwId: number; question: string }) =>
      StudentWorkspaceService.askHomeworkQuestion(hwId, question),
    onSuccess: (response, variables) => {
      setChatByHw((previous) => ({
        ...previous,
        [variables.hwId]: {
          ...(previous[variables.hwId] || { q: "" }),
          a: response.answer || "",
          loading: false,
        },
      }));
    },
    onError: (_error, variables) => {
      setChatByHw((previous) => ({
        ...previous,
        [variables.hwId]: {
          ...(previous[variables.hwId] || { q: "" }),
          a: "Could not get response right now.",
          loading: false,
        },
      }));
    },
  });

  const handleBulkFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0 || pendingHwId === null) return;

    const toBase64 =
      (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

    try {
      setUploadingHwId(pendingHwId);
      const filesBase64 = await Promise.all(files.map(toBase64));
      submitHomework.mutate({ hwId: pendingHwId, filesBase64 });
    } catch {
      toast({ title: "Upload failed", description: "Could not read one or more files.", variant: "destructive" });
      setUploadingHwId(null);
      setPendingHwId(null);
    } finally {
      event.target.value = "";
    }
  };

  const userName = (user as any)?.name || "Student";
  const initials = getInitials(userName);

  return (
    <div className="sf-root">
      <StudentTopNav activeTab="homework" initials={initials} onProfileClick={() => setIsProfilePanelOpen(true)} />

      <div className="sf-page">
        <div className="sf-page-head">
          <div>
            <div className="sf-page-title">Homework</div>
            <div className="sf-page-sub">Assigned homework for your class and section</div>
          </div>
        </div>

        <input
          ref={hwFileRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={handleBulkFileChange}
        />

        {analyticsQuery.data && <HomeworkStats analytics={analyticsQuery.data} />}

        <div className="sf-panel">
          <div className="sf-panel-title">My Homework</div>
          <div className="sf-panel-sub">Grouped by subject and month, sorted by due date (latest first)</div>

          {isHomeworkLoading ? (
            <div style={{ padding: "24px 0", textAlign: "center" }}>
              <Spinner size="sm" />
            </div>
          ) : !homeworkList || homeworkList.length === 0 ? (
            <div className="sf-empty">
              <div className="sf-empty-icon">📚</div>
              No homework assigned yet for your class and section.
            </div>
          ) : (
            Object.entries(groupedHomework).map(([subject, months]) => (
              <div key={subject} style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{subject}</div>
                {Object.entries(months).map(([month, items]) => (
                  <div key={month} style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--dim)",
                        letterSpacing: "1px",
                        textTransform: "uppercase",
                        marginBottom: 8,
                      }}
                    >
                      {month}
                    </div>

                    {items.map((homework) => {
                      const submission = homework.submission;
                      const dueDate = new Date(homework.dueDate);
                      const isDuePassed = new Date() > dueDate;
                      const isEditable = !isDuePassed;
                      const isUploading = uploadingHwId === homework.id;
                      const statusLabel = submission
                        ? submission.status === "needs_improvement"
                          ? "Needs Improvement"
                          : "Submitted"
                        : isDuePassed
                          ? "Pending (Overdue)"
                          : "Pending";
                      const statusClass = submission
                        ? submission.status === "needs_improvement"
                          ? "sf-es-draft"
                          : "sf-es-done"
                        : isDuePassed
                          ? "sf-es-draft"
                          : "";

                      const chatState = chatByHw[homework.id] || { q: "", a: "", loading: false };

                      return (
                        <div
                          key={homework.id}
                          className="sf-exam-item"
                          style={{ cursor: "default", alignItems: "flex-start", flexDirection: "column", gap: 8 }}
                        >
                          <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 12 }}>
                            <div className="sf-exam-subj" style={{ background: "var(--lav-bg)", flexShrink: 0 }}>
                              📝
                            </div>
                            <div className="sf-exam-info" style={{ flex: 1 }}>
                              <div className="sf-exam-name">{homework.description}</div>
                              <div className="sf-exam-meta">
                                Due: {dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </div>
                            </div>
                            <span className={`sf-exam-status ${statusClass}`} style={{ flexShrink: 0 }}>
                              {statusLabel}
                            </span>
                            {(!submission || isEditable) && (
                              <Button
                                size="sm"
                                className="rounded-xl gap-1"
                                disabled={isUploading}
                                onClick={() => {
                                  setPendingHwId(homework.id);
                                  hwFileRef.current?.click();
                                }}
                                data-testid={`button-submit-hw-${homework.id}`}
                              >
                                {isUploading ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                                  </>
                                ) : (
                                  <>
                                    <Upload className="h-3 w-3" /> {submission ? "Edit Submission" : "Upload Answer Sheets"}
                                  </>
                                )}
                              </Button>
                            )}
                          </div>

                          {!isEditable && submission && (
                            <div style={{ fontSize: 12, color: "var(--mid)" }}>
                              Submission is locked because the due date has passed.
                            </div>
                          )}

                          {submission?.aiFeedback && (
                            <div
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                background: "var(--lav-bg)",
                                borderRadius: 10,
                                fontSize: 12.5,
                                color: "var(--ink2)",
                                lineHeight: 1.6,
                              }}
                            >
                              <b>Analysis:</b> {submission.aiFeedback}
                              {submission.correctnessScore != null && (
                                <span
                                  style={{
                                    marginLeft: 8,
                                    fontWeight: 700,
                                    color: submission.correctnessScore >= 70 ? "var(--green)" : "var(--amber)",
                                  }}
                                >
                                  {submission.correctnessScore}%
                                </span>
                              )}
                            </div>
                          )}

                          {submission && (
                            <PrivateEvaluationQA
                              question={chatState.q}
                              answer={chatState.a}
                              loading={chatState.loading}
                              onQuestionChange={(value) => {
                                setChatByHw((previous) => ({
                                  ...previous,
                                  [homework.id]: { ...chatState, q: value },
                                }));
                              }}
                              onAsk={() => {
                                setChatByHw((previous) => ({
                                  ...previous,
                                  [homework.id]: { ...chatState, loading: true },
                                }));
                                chatMutation.mutate({ hwId: homework.id, question: chatState.q });
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <ProfileDrawer open={isProfilePanelOpen} onClose={() => setIsProfilePanelOpen(false)} />
    </div>
  );
}
