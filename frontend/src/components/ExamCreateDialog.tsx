import { useEffect } from "react";

type Props = {
  subjectName: string;
  title: string;
  description: string;
  durationMinutes: number;
  maxStrikes: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  publish: boolean;
  questionCount: number;
  participantCount: number;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export default function ExamCreateDialog({
  subjectName,
  title,
  description,
  durationMinutes,
  maxStrikes,
  shuffleQuestions,
  shuffleOptions,
  publish,
  questionCount,
  participantCount,
  saving,
  error,
  onClose,
  onConfirm,
}: Props) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saving, onClose]);

  const publishWithoutParticipants = publish && participantCount === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-create-title"
        className="my-6 w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Konfirmasi Ujian
            </p>
            <h2
              id="exam-create-title"
              className="text-xl font-bold text-slate-900"
            >
              Buat ujian ini?
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Periksa kembali detail ujian sebelum disimpan.
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

        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {description && (
            <p className="mt-1 line-clamp-2 text-sm text-slate-500">
              {description}
            </p>
          )}

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Mapel
              </dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {subjectName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Durasi
              </dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {durationMinutes} menit
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Maks. pelanggaran
              </dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {maxStrikes}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Jumlah soal
              </dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {questionCount} soal
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Peserta
              </dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {participantCount} peserta
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Status awal
              </dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {publish ? "Published" : "Draft"}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span
              className={`rounded-full px-2.5 py-1 ${
                shuffleQuestions
                  ? "bg-brand-50 text-brand-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              Acak soal: {shuffleQuestions ? "ya" : "tidak"}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 ${
                shuffleOptions
                  ? "bg-brand-50 text-brand-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              Acak opsi: {shuffleOptions ? "ya" : "tidak"}
            </span>
          </div>
        </div>

        {publishWithoutParticipants && (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold">Belum ada peserta dipilih.</p>
            <p className="mt-1">
              Ujian akan dipublikasikan tetapi tidak muncul di daftar siswa
              sampai peserta ditambahkan.
            </p>
          </div>
        )}

        {!publish && (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Ujian akan disimpan sebagai draft dan belum bisa dikerjakan siswa.
          </div>
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
            Periksa lagi
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onConfirm}
            disabled={saving}
          >
            {saving ? "Membuat ujian..." : "Ya, Buat Ujian"}
          </button>
        </div>
      </div>
    </div>
  );
}
