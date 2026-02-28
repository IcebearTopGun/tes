import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import ProfilePanel from "@/components/ProfilePanel";

interface ProfileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function ProfileDrawer({ open, onClose }: ProfileDrawerProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.35)", backdropFilter: "blur(2px)", zIndex: 60 }}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{
              position: "fixed", top: 0, right: 0, height: "100vh",
              width: "min(420px, 100vw)",
              background: "var(--white, #faf9f6)",
              borderLeft: "1px solid rgba(26,26,46,0.1)",
              boxShadow: "-8px 0 32px rgba(26,26,46,0.12)",
              zIndex: 61, display: "flex", flexDirection: "column",
              overflowY: "auto",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "18px 22px 14px", borderBottom: "1px solid var(--rule, rgba(26,26,46,0.08))",
              position: "sticky", top: 0, background: "var(--white, #faf9f6)", zIndex: 1,
            }}>
              <span style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 600 }}>My Profile</span>
              <button
                onClick={onClose}
                style={{
                  width: 32, height: 32, borderRadius: "50%", background: "var(--cream, #f0ede6)",
                  border: "1px solid var(--rule, rgba(26,26,46,0.1))", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                data-testid="button-close-profile-drawer"
              >
                <X size={16} style={{ color: "var(--ink, #1a1a2e)" }} />
              </button>
            </div>
            <div style={{ flex: 1, padding: "22px", overflowY: "auto" }}>
              <ProfilePanel hideTitle />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
