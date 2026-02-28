import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchWithAuth } from "@/lib/fetcher";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Camera, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export default function ProfilePanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/profile"],
    queryFn: () => fetchWithAuth("/api/profile").then(r => r.json()),
    staleTime: 60000,
  });

  const updateProfile = useMutation({
    mutationFn: (data: { name?: string; phone?: string }) =>
      fetchWithAuth("/api/profile", { method: "PATCH", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Profile updated" });
      setIsEditing(false);
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Invalid file type", description: "Only JPG, PNG, WEBP allowed", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB", variant: "destructive" });
      return;
    }
    setIsUploadingPhoto(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const res = await fetchWithAuth("/api/profile/upload-photo", {
          method: "POST",
          body: JSON.stringify({ imageBase64: reader.result as string }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
        toast({ title: "Photo uploaded successfully" });
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      } finally {
        setIsUploadingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const startEdit = () => {
    setEditName(profile?.name || "");
    setEditPhone(profile?.phone || "");
    setIsEditing(true);
  };

  if (isLoading) {
    return <div style={{ padding: "40px", textAlign: "center" }}><Spinner /></div>;
  }

  const role = profile?.role || user?.role || "student";
  const name = profile?.name || (user as any)?.name || "";
  const initials = name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

  let subjects: string[] = [];
  let classes: string[] = [];
  try { subjects = JSON.parse(profile?.subjectsAssigned || "[]"); } catch {}
  try { classes = JSON.parse(profile?.classesAssigned || "[]"); } catch {}

  return (
    <div className="sf-panel" style={{ maxWidth: 600 }}>
      <div className="sf-panel-title">My Profile</div>
      <div className="sf-panel-sub">Manage your account information and profile photo</div>

      {/* Photo + basic info */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginBottom: 28 }}>
        {/* Avatar */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 88, height: 88, borderRadius: "50%",
            overflow: "hidden", background: "var(--lav-bg)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "3px solid var(--border)", fontSize: 26, fontWeight: 700,
            color: "var(--ink)", fontFamily: "Fraunces, serif",
          }}>
            {profile?.profilePhotoUrl ? (
              <img src={profile.profilePhotoUrl} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <User style={{ width: 36, height: 36, color: "var(--mid)" }} />
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={isUploadingPhoto}
            style={{
              position: "absolute", bottom: 0, right: 0, width: 28, height: 28,
              borderRadius: "50%", background: "var(--ink)", border: "2px solid var(--white)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--white)",
            }}
            data-testid="button-upload-photo"
          >
            {isUploadingPhoto ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <Camera style={{ width: 12, height: 12 }} />}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
        </div>

        {/* Name + role pill */}
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>{name}</div>
          <div style={{ marginTop: 4 }}>
            <span style={{
              display: "inline-block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.08em", padding: "3px 10px", borderRadius: 6,
              background: role === "admin" ? "var(--ink)" : role === "teacher" ? "var(--lav-bg)" : "var(--green-bg)",
              color: role === "admin" ? "var(--white)" : "var(--ink)",
            }}>
              {role}
            </span>
            {role === "teacher" && profile?.employeeId && (
              <span style={{ marginLeft: 8, fontSize: 12, color: "var(--mid)" }}>ID: {profile.employeeId}</span>
            )}
            {role === "admin" && profile?.employeeId && (
              <span style={{ marginLeft: 8, fontSize: 12, color: "var(--mid)" }}>Employee: {profile.employeeId}</span>
            )}
            {role === "student" && profile?.admissionNumber && (
              <span style={{ marginLeft: 8, fontSize: 12, color: "var(--mid)" }}>Adm. No: {profile.admissionNumber}</span>
            )}
          </div>
        </div>
      </div>

      {/* Fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Name */}
        <div className="sf-fld">
          <label className="sf-fld-lbl">Full Name</label>
          {isEditing ? (
            <Input value={editName} onChange={e => setEditName(e.target.value)} className="rounded-xl" data-testid="input-edit-name" />
          ) : (
            <div style={{ padding: "9px 14px", background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: 10, fontSize: 14 }}>{profile?.name || "—"}</div>
          )}
        </div>

        {/* Email */}
        <div className="sf-fld">
          <label className="sf-fld-lbl">Email Address</label>
          <div style={{ padding: "9px 14px", background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: 10, fontSize: 14, color: "var(--mid)" }}>{profile?.email || "—"}</div>
        </div>

        {/* Phone */}
        <div className="sf-fld">
          <label className="sf-fld-lbl">Phone Number</label>
          {isEditing ? (
            <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+91 98765 43210" className="rounded-xl" data-testid="input-edit-phone" />
          ) : (
            <div style={{ padding: "9px 14px", background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: 10, fontSize: 14 }}>{profile?.phone || "Not set"}</div>
          )}
        </div>

        {/* Role-specific fields */}
        {role === "student" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="sf-fld">
              <label className="sf-fld-lbl">Class</label>
              <div style={{ padding: "9px 14px", background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: 10, fontSize: 14, color: "var(--mid)" }}>Class {profile?.studentClass || "—"}</div>
            </div>
            <div className="sf-fld">
              <label className="sf-fld-lbl">Section</label>
              <div style={{ padding: "9px 14px", background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: 10, fontSize: 14, color: "var(--mid)" }}>Section {profile?.section || "—"}</div>
            </div>
          </div>
        )}

        {role === "teacher" && (
          <>
            {subjects.length > 0 && (
              <div className="sf-fld">
                <label className="sf-fld-lbl">Subjects Assigned</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {subjects.map((s: string) => (
                    <span key={s} style={{ padding: "3px 10px", borderRadius: 6, background: "var(--lav-bg)", fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{s}</span>
                  ))}
                </div>
              </div>
            )}
            {classes.length > 0 && (
              <div className="sf-fld">
                <label className="sf-fld-lbl">Assigned Classes</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {classes.map((c: string) => (
                    <span key={c} style={{ padding: "3px 10px", borderRadius: 6, background: "var(--cream)", border: "1px solid var(--rule)", fontSize: 12, color: "var(--mid)" }}>Class {c}</span>
                  ))}
                </div>
              </div>
            )}
            {profile?.isClassTeacher === 1 && (
              <div className="sf-fld">
                <label className="sf-fld-lbl">Class Teacher Of</label>
                <div style={{ padding: "9px 14px", background: "var(--green-bg)", border: "1px solid var(--rule)", borderRadius: 10, fontSize: 14, fontWeight: 600 }}>Class {profile.classTeacherOf}</div>
              </div>
            )}
          </>
        )}

        {role === "admin" && (
          <div className="sf-fld">
            <label className="sf-fld-lbl">Designation</label>
            <div style={{ padding: "9px 14px", background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: 10, fontSize: 14, color: "var(--mid)" }}>School Administrator</div>
          </div>
        )}

        {/* Edit / Save buttons */}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          {isEditing ? (
            <>
              <Button size="sm" className="rounded-xl" disabled={updateProfile.isPending} onClick={() => updateProfile.mutate({ name: editName, phone: editPhone })} data-testid="button-save-profile">
                {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setIsEditing(false)}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="rounded-xl" onClick={startEdit} data-testid="button-edit-profile">
              Edit Profile
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
