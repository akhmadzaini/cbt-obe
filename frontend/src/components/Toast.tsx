import { useEffect, useRef } from "react";

type Props = {
  title: string;
  message?: string;
  onClose: () => void;
  durationMs?: number;
};

export default function Toast({
  title,
  message,
  onClose,
  durationMs = 7000,
}: Props) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const timer = window.setTimeout(() => onCloseRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs]);

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] w-[calc(100%-2rem)] max-w-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-600">
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {message && (
            <p className="mt-1 text-sm text-slate-600">{message}</p>
          )}
        </div>
        <button
          type="button"
          aria-label="Tutup notifikasi"
          className="shrink-0 rounded-lg px-1.5 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  );
}
