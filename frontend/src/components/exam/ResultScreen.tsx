import type { ResultState } from "./types";

type Props = {
  result: ResultState;
  examTitle: string;
  onBack: () => void;
};

export default function ResultScreen({ result, examTitle, onBack }: Props) {
  const partial = result.gradingStatus !== "completed";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          Jawaban Terkumpul
        </h1>
        <p className="mt-1 text-sm text-slate-500">{examTitle}</p>

        <div className="mt-6 rounded-2xl bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Nilai
          </p>
          <p className="text-4xl font-black text-slate-900">{result.score}</p>
        </div>

        {partial && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Sebagian soal (essay) menunggu penilaian manual.
          </p>
        )}

        <button type="button" className="btn-primary mt-6 w-full" onClick={onBack}>
          Kembali ke Daftar Ujian
        </button>
      </div>
    </div>
  );
}
