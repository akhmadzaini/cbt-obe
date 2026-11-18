import { useEffect, useRef, useState } from "react";
import type { AdminTab } from "../lib/types";

type Props = {
  active: AdminTab;
  onSelect: (tab: AdminTab) => void;
  onLogout: () => void;
  isAdmin?: boolean;
};

const EXAM_ITEMS: { tab: AdminTab; label: string }[] = [
  { tab: "exam", label: "Ujian" },
  { tab: "grading", label: "Nilai Essay" },
  { tab: "results", label: "Skor" },
];

const EXAM_TABS = new Set<AdminTab>(EXAM_ITEMS.map((item) => item.tab));

function tabClass(isActive: boolean): string {
  return `btn ${isActive ? "btn-primary" : "btn-secondary"}`;
}

export default function AdminNav({
  active,
  onSelect,
  onLogout,
  isAdmin = false,
}: Props) {
  const [examOpen, setExamOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!examOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setExamOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExamOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [examOpen]);

  useEffect(() => {
    setExamOpen(false);
  }, [active]);

  const examActive = EXAM_TABS.has(active);

  function select(tab: AdminTab) {
    setExamOpen(false);
    onSelect(tab);
  }

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Menu admin">
      <button
        type="button"
        className={tabClass(active === "bank")}
        aria-current={active === "bank" ? "page" : undefined}
        onClick={() => select("bank")}
      >
        Bank Soal
      </button>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className={tabClass(examActive)}
          aria-haspopup="menu"
          aria-expanded={examOpen}
          onClick={() => setExamOpen((previous) => !previous)}
        >
          Ujian
          <svg
            className={`h-3 w-3 transition-transform ${examOpen ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {examOpen && (
          <div
            role="menu"
            aria-label="Menu Ujian"
            className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          >
            {EXAM_ITEMS.map((item) => {
              const isActive = active === item.tab;
              return (
                <button
                  key={item.tab}
                  type="button"
                  role="menuitem"
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? "bg-brand-50 font-semibold text-brand-700"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                  onClick={() => select(item.tab)}
                >
                  <span>{item.label}</span>
                  {isActive && (
                    <span aria-hidden="true" className="text-brand-600">
                      •
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        className={tabClass(active === "participants")}
        aria-current={active === "participants" ? "page" : undefined}
        onClick={() => select("participants")}
      >
        Peserta
      </button>

      {isAdmin && (
        <button
          type="button"
          className={tabClass(active === "teachers")}
          aria-current={active === "teachers" ? "page" : undefined}
          onClick={() => select("teachers")}
        >
          Guru
        </button>
      )}

      {isAdmin && (
        <button
          type="button"
          className={tabClass(active === "system")}
          aria-current={active === "system" ? "page" : undefined}
          onClick={() => select("system")}
        >
          Sistem
        </button>
      )}

      <button type="button" className="btn-secondary" onClick={onLogout}>
        Keluar
      </button>
    </nav>
  );
}
