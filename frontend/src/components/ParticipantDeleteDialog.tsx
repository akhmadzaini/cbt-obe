import type { Participant, ParticipantUsage } from "../lib/types";

type Props = {
  participant: Participant;
  usage: ParticipantUsage | null;
  loadingUsage: boolean;
  deleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID");
}

export default function ParticipantDeleteDialog({
  participant,
  usage,
  loadingUsage,
  deleting,
  error,
  onClose,
  onConfirm,
}: Props) {
  const canDelete = Boolean(usage?.canDelete);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
      <div className="my-6 w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">
              Hapus Peserta
            </p>
            <h2 className="text-xl font-bold text-slate-900">
              Hapus akun peserta?
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {participant.fullName} ·{" "}
              <span className="font-mono text-xs">{participant.username}</span>
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={deleting}
          >
            Tutup
          </button>
        </div>

        {loadingUsage && (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Memeriksa sesi ujian peserta...
          </div>
        )}

        {usage && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total sesi
                </p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {usage.sessionCount}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Sesi aktif
                </p>
                <p className="mt-1 text-xl font-bold text-amber-800">
                  {usage.activeSessionCount}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Selesai
                </p>
                <p className="mt-1 text-xl font-bold text-emerald-800">
                  {usage.finishedSessionCount}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Sesi terakhir: {formatDateTime(usage.lastSessionAt)}
            </p>

            {usage.canDelete ? (
              <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Peserta belum memiliki sesi ujian. Akun dapat dihapus permanen.
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <p className="font-semibold">Peserta tidak dapat dihapus.</p>
                <p className="mt-1">
                  {usage.reasons.join(" ") ||
                    "Peserta masih terhubung dengan data ujian."}
                </p>
                <p className="mt-2 text-rose-700">
                  Gunakan tombol <strong>Edit</strong> untuk menonaktifkan akun
                  agar peserta tidak bisa login.
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
            disabled={deleting}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            disabled={!canDelete || loadingUsage || deleting}
          >
            {deleting ? "Menghapus..." : "Hapus Peserta"}
          </button>
        </div>
      </div>
    </div>
  );
}
