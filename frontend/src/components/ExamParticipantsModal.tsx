import { useEffect, useMemo, useState } from "react";
import ParticipantPicker from "./ParticipantPicker";
import type { ExamParticipantRow, ExamSummary } from "../lib/types";

type Props = {
  exam: ExamSummary;
  participants: ExamParticipantRow[] | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (participantIds: string[]) => void | Promise<void>;
};

export default function ExamParticipantsModal({
  exam,
  participants,
  loading,
  saving,
  error,
  onClose,
  onSave,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!participants) return;
    setSelectedIds(
      participants
        .filter((participant) => participant.assigned)
        .map((participant) => participant.id),
    );
  }, [participants]);

  const lockedIds = useMemo(
    () =>
      new Set(
        (participants ?? [])
          .filter((participant) => participant.sessionCount > 0)
          .map((participant) => participant.id),
      ),
    [participants],
  );

  const readOnly = exam.status === "archived";
  const assignedCount =
    participants?.filter((participant) => participant.assigned).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
      <div className="my-6 w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Peserta Ujian
            </p>
            <h2 className="text-xl font-bold text-slate-900">{exam.title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Hanya peserta yang dipilih yang dapat melihat dan memulai ujian
              ini.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Tutup
          </button>
        </div>

        {readOnly && (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Ujian ini sudah diarsipkan. Daftar peserta hanya dapat dilihat.
          </div>
        )}

        {loading && (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Memuat daftar peserta...
          </div>
        )}

        {participants && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                  Di-assign
                </p>
                <p className="mt-1 text-xl font-bold text-brand-800">
                  {assignedCount}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total peserta
                </p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {participants.length}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Terkunci
                </p>
                <p className="mt-1 text-xl font-bold text-amber-800">
                  {lockedIds.size}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <ParticipantPicker
                participants={participants}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
                lockedIds={lockedIds}
                emptyMessage="Belum ada akun peserta. Tambahkan peserta terlebih dahulu di tab Peserta."
              />
            </div>

            {selectedIds.length === 0 && !readOnly && (
              <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Belum ada peserta dipilih. Ujian yang dipublikasikan tidak akan
                muncul bagi siswa sampai peserta ditambahkan.
              </div>
            )}

            {lockedIds.size > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Peserta yang sudah memiliki sesi ujian tidak dapat dilepas agar
                riwayat pengerjaannya tetap aman.
              </p>
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
            disabled={saving}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void onSave(selectedIds)}
            disabled={loading || saving || readOnly || !participants}
          >
            {saving ? "Menyimpan..." : "Simpan Peserta"}
          </button>
        </div>
      </div>
    </div>
  );
}
