type Props = {
  studentName: string;
  username: string;
  examTitle: string;
  strikeCount: number;
  resetting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export default function SessionResetDialog({
  studentName,
  username,
  examTitle,
  strikeCount,
  resetting,
  error,
  onClose,
  onConfirm,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
      <div className="my-6 w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
              Reset Sesi Peserta
            </p>
            <h2 className="text-xl font-bold text-slate-900">{studentName}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {username} · {examTitle}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={resetting}
          >
            Tutup
          </button>
        </div>

        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">
            Sesi ini dikumpulkan paksa karena melebihi batas pelanggaran.
          </p>
          <p className="mt-1">
            Reset akan membuka kembali sesi agar peserta dapat melanjutkan
            ujian. Peserta harus login ulang dan meminta admin untuk melakukan
            reset ini.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Strike tercatat
            </p>
            <p className="mt-1 text-xl font-bold text-slate-900">
              {strikeCount}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Status setelah reset
            </p>
            <p className="mt-1 text-sm font-bold text-emerald-800">
              Sedang berjalan
            </p>
          </div>
        </div>

        <ul className="mt-4 list-disc space-y-1 rounded-xl bg-slate-50 px-8 py-3 text-sm text-slate-600">
          <li>Jawaban yang sudah tersimpan tetap dipertahankan.</li>
          <li>
            Strike dikembalikan ke 0 agar peserta tidak langsung terhenti lagi.
          </li>
          <li>
            Waktu selama sesi terhenti dikembalikan. Timer tetap dijeda sampai
            peserta masuk mode layar penuh.
          </li>
          <li>
            Skor sementara dan nilai essay yang sudah diisi akan dihapus, lalu
            dihitung ulang saat peserta mengumpulkan jawaban lagi.
          </li>
          <li>Riwayat pelanggaran tetap tersimpan untuk audit.</li>
        </ul>

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
            disabled={resetting}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onConfirm}
            disabled={resetting}
          >
            {resetting ? "Mereset..." : "Reset Sesi"}
          </button>
        </div>
      </div>
    </div>
  );
}
