import { useState } from "react";
import { formatDateTime } from "../lib/format";
import { sessionStatusLabel } from "../lib/labels";
import type { SessionCancelUsage } from "../lib/types";

type Props = {
  usage: SessionCancelUsage | null;
  loadingUsage: boolean;
  cancelling: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

const CONFIRM_PHRASE = "HAPUS";

export default function SessionCancelDialog({
  usage,
  loadingUsage,
  cancelling,
  error,
  onClose,
  onConfirm,
}: Props) {
  const [confirmation, setConfirmation] = useState("");
  const canCancel = Boolean(usage?.canCancel);
  const confirmed =
    confirmation.trim().toUpperCase() === CONFIRM_PHRASE && canCancel;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
      <div className="my-6 w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">
              Batalkan Submission
            </p>
            <h2 className="text-xl font-bold text-slate-900">
              {usage?.studentName ?? "Memuat peserta..."}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {usage
                ? `${usage.username} · ${usage.examTitle}`
                : "Memeriksa sesi peserta..."}
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
            Memeriksa jawaban dan sesi peserta...
          </div>
        )}

        {usage && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Status sesi
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {sessionStatusLabel(usage.sessionStatus)}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Jawaban
                </p>
                <p className="mt-1 text-xl font-bold text-amber-800">
                  {usage.answerCount}
                </p>
              </div>
              <div className="rounded-xl bg-rose-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                  Pelanggaran
                </p>
                <p className="mt-1 text-xl font-bold text-rose-800">
                  {usage.violationCount}
                </p>
              </div>
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                  Skor
                </p>
                <p className="mt-1 text-xl font-bold text-brand-800">
                  {usage.score ?? "0"}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Selesai: {formatDateTime(usage.finishedAt)} ·{" "}
              {usage.screenshotCount} screenshot pelanggaran
            </p>

            {canCancel ? (
              <>
                <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <p className="font-semibold">Tindakan ini permanen.</p>
                  <p className="mt-1">
                    Jawaban, nilai essay, sesi, riwayat pelanggaran, dan
                    screenshot peserta akan dihapus. Peserta tetap terdaftar
                    pada ujian dan dapat memulai sesi baru.
                  </p>
                  <p className="mt-2">
                    Peserta hanya bisa mengulang jika ujian masih berstatus
                    publikasi dan berada dalam rentang waktu ujian.
                  </p>
                </div>

                <label className="mt-4 block">
                  <span className="label">
                    Ketik <strong>{CONFIRM_PHRASE}</strong> untuk mengonfirmasi
                  </span>
                  <input
                    className="input"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    placeholder={CONFIRM_PHRASE}
                    autoComplete="off"
                    disabled={cancelling}
                  />
                </label>
              </>
            ) : (
              <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <p className="font-semibold">
                  Submission tidak dapat dibatalkan.
                </p>
                <p className="mt-1">
                  {usage.reasons.join(" ") ||
                    "Sesi ini tidak memenuhi syarat pembatalan."}
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
            disabled={!confirmed || loadingUsage || cancelling}
          >
            {cancelling ? "Membatalkan..." : "Batalkan Submission"}
          </button>
        </div>
      </div>
    </div>
  );
}
