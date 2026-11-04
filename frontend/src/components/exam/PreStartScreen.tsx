import type { ExamSummary } from "../../lib/types";

type Props = {
  exam: ExamSummary | null;
  error: string | null;
  starting: boolean;
  onStart: () => void;
  onBack: () => void;
};

export default function PreStartScreen({
  exam,
  error,
  starting,
  onStart,
  onBack,
}: Props) {
  const finished = exam?.session?.status === "finished";
  const forced =
    finished && exam?.session?.finishedReason === "force_submit";
  const unavailable = !exam;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
          Persiapan Ujian
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {exam?.title ?? "Ujian"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {exam?.subjectName ?? ""} · {exam?.durationMinutes ?? "-"} menit
        </p>

        <div className="mt-5 space-y-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Aturan selama ujian</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Ujian hanya berjalan dalam mode layar penuh.</li>
            <li>
              Berpindah tab/aplikasi, keluar fullscreen, atau injeksi ekstensi
              dicatat sebagai pelanggaran.
            </li>
            <li>
              Maksimal {exam?.maxStrikes ?? 3} pelanggaran. Melebihi batas =
              jawaban dikumpulkan paksa.
            </li>
            <li>Klik kanan, copy/paste, dan shortcut keyboard diblokir.</li>
            <li>Jawaban tersimpan otomatis setiap kali dipilih.</li>
          </ul>
        </div>

        {finished && (
          <div
            className={`mt-4 rounded-xl px-4 py-3 text-sm ${
              forced
                ? "bg-rose-50 text-rose-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {forced ? (
              <>
                Sesi Anda dihentikan karena melebihi batas pelanggaran. Hubungi{" "}
                <strong>admin/pengawas</strong> untuk mereset sesi agar Anda
                dapat melanjutkan ujian.
              </>
            ) : (
              <>
                Anda sudah menyelesaikan ujian ini. Nilai:{" "}
                <strong>{exam?.session?.score ?? "-"}</strong>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button type="button" className="btn-secondary" onClick={onBack}>
            Kembali
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={starting || finished || unavailable}
            onClick={onStart}
          >
            {starting
              ? "Menyiapkan..."
              : unavailable
                ? "Tidak Tersedia"
                : finished
                  ? forced
                    ? "Menunggu Reset Admin"
                    : "Sudah Selesai"
                  : "Mulai Ujian (Layar Penuh)"}
          </button>
        </div>
      </div>
    </div>
  );
}
