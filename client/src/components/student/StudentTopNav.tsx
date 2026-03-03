import { useRef, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

type StudentNavTab = "overview" | "homework" | "evaluations";

interface StudentTopNavProps {
  activeTab: StudentNavTab;
  initials: string;
  onProfileClick: () => void;
}

export default function StudentTopNav({ activeTab, initials, onProfileClick }: StudentTopNavProps) {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const [showAvaMenu, setShowAvaMenu] = useState(false);
  const avaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (avaRef.current && !avaRef.current.contains(e.target as Node)) setShowAvaMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <nav className="sf-topnav">
      <div className="sf-logo">
        <div className="sf-logo-mark">S</div>
        <span className="sf-logo-name">ScholarFlow</span>
      </div>

      <div className="sf-nav-tabs">
        <button className={`sf-nav-tab${activeTab === "overview" ? " on" : ""}`} onClick={() => setLocation("/student-dashboard")}>
          <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
          Overview
        </button>
        <button className={`sf-nav-tab${activeTab === "homework" ? " on" : ""}`} onClick={() => setLocation("/student-dashboard/homework")}>
          <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Homework
        </button>
        <button className={`sf-nav-tab${activeTab === "evaluations" ? " on" : ""}`} onClick={() => setLocation("/student-dashboard/evaluations")}>
          <svg className="sf-nav-tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          Exam Evaluations
        </button>
      </div>

      <div className="sf-nav-right">
        <div className="sf-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: "var(--dim)", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input placeholder="Search…" />
        </div>
        <div className="sf-ic-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="sf-notif-dot" />
        </div>
        <div className="sf-ava" ref={avaRef} onClick={() => setShowAvaMenu(v => !v)}>
          {initials}
          {showAvaMenu && (
            <div className="sf-ava-menu">
              <button
                className="sf-ava-menu-item"
                onClick={() => {
                  setShowAvaMenu(false);
                  onProfileClick();
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Profile
              </button>
              <button className="sf-ava-menu-item danger" onClick={() => logout()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
