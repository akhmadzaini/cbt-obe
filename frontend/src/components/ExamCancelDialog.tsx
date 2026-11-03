import type { ExamSummary, ExamUsage } from "../lib/types";

type Props = {
  exam: ExamSummary;
  usage: ExamUsage | null;
  loadingUsage: boolean;
  cancelling: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

function statusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "published":
      return "Published";
    case "archived":
      return "Arsip";
    default:
      return status;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID");
}

export default function ExamCancelDialog({
  exam,
  usage,
  loadingUsage,
  cancelling,
  error,
  onClose,
  onConfirm,
}: Props) {
  const canCancel = Boolean(usage?.canCancel);
  const hasSessions = (usage?.sessionCount ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
      <div className="my-6 w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">
              Batalkan Ujian
            </p>
            <h2 className="text-xl font-bold text-slate-900">{exam.title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {exam.subjectName ?? "Tanpa mapel"} · status:{" "}
              {statusLabel(exam.status)}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={cancelling}
          >
            Tutup
          </button>
        </div>

        {loadingUsage && (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Memeriksa sesi peserta...
          </div>
        )}

        {usage && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Soal
                </p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {usage.questionCount}
                </p>
              </div>
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                  Peserta
                </p>
                <p className="mt-1 text-xl font-bold text-brand-800">
                  {usage.participantCount}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Sesi
                </p>
                <p className="mt-1 text-xl font-bold text-amber-800">
                  {usage.sessionCount}
                </p>
              </div>
              <div className="rounded-xl bg-rose-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                  Sesi aktif
                </p>
                <p className="mt-1 text-xl font-bold text-rose-800">
                  {usage.activeSessionCount}
                </p>
              </div>
            </div>

            {hasSessions && (
              <p className="mt-3 text-xs text-slate-500">
                Sesi pertama: {formatDateTime(usage.firstSessionAt)} · Sesi
                terakhir: {formatDateTime(usage.lastSessionAt)}
              </p>
            )}

            {canCancel ? (
              <>
                <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  <p className="font-semibold">
                    Belum ada peserta yang melaksanakan ujian.
                  </p>
                  <p className="mt-1">
                    Ujian ini aman dibatalkan karena belum memiliki sesi
                    pengerjaan.
                  </p>
                </div>
                <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="font-semibold">Tindakan ini permanen.</p>
                  <p className="mt-1">
                    Ujian, daftar peserta, dan relasi soalnya akan dihapus.
                    Soal di bank soal tetap tersimpan.
                  </p>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <p className="font-semibold">Ujian tidak dapat dibatalkan.</p>
                <p className="mt-1">
                  {usage.reasons.join(" ") ||
                    "Ujian sudah memiliki sesi peserta."}
                </p>
                <p className="mt-2">
                  Gunakan tombol <strong>Arsipkan</strong> agar ujian tidak
                  muncul lagi bagi peserta tanpa menghapus riwayatnya.
                </p>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={cancelling}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            disabled={!canCancel || loadingUsage || cancelling}
          >
            {cancelling ? "Membatalkan..." : "Batalkan Ujian"}
          </button>
        </div>
      </div>
    </div>
  );
}
