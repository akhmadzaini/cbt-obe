import type { AdminQuestion, QuestionUsage } from "../lib/types";
import { stripHtml } from "../lib/format";
import { examStatusLabel } from "../lib/labels";

type Props = {
  question: AdminQuestion;
  usage: QuestionUsage | null;
  loadingUsage: boolean;
  deleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export default function QuestionDeleteDialog({
  question,
  usage,
  loadingUsage,
  deleting,
  error,
  onClose,
  onConfirm,
}: Props) {
  const canDelete = Boolean(usage?.canDelete);
  const willEmptyExam = Boolean(
    usage?.exams.some((exam) => exam.questionCount <= 1),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
      <div className="my-6 w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">
              Hapus Soal
            </p>
            <h2 className="text-xl font-bold text-slate-900">
              Hapus soal ini?
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              {stripHtml(question.questionText).slice(0, 220) ||
                "(tanpa teks soal)"}
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
            Memeriksa pemakaian soal...
          </div>
        )}

        {usage && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Ujian
                </p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {usage.examCount}
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
                  Jawaban
                </p>
                <p className="mt-1 text-xl font-bold text-rose-800">
                  {usage.answerCount}
                </p>
              </div>
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                  Sesi aktif
                </p>
                <p className="mt-1 text-xl font-bold text-brand-800">
                  {usage.activeSessionCount}
                </p>
              </div>
            </div>

            {usage.exams.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-4">Ujian</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Sesi</th>
                      <th className="py-2 pr-4">Jawaban</th>
                      <th className="py-2">Soal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.exams.map((exam) => (
                      <tr
                        key={exam.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 pr-4 font-medium text-slate-800">
                          {exam.title}
                        </td>
                        <td className="py-2 pr-4 text-slate-500">
                          {examStatusLabel(exam.status)}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {exam.sessionCount}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {exam.answerCount}
                        </td>
                        <td className="py-2 text-slate-600">
                          {exam.questionCount}
                          {canDelete ? ` → ${exam.questionCount - 1}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!usage.canDelete && (
              <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <p className="font-semibold">Soal tidak dapat dihapus.</p>
                <p className="mt-1">
                  {usage.reasons.join(" ") ||
                    "Soal ini masih terpakai pada data ujian."}
                </p>
              </div>
            )}

            {usage.canDelete && usage.examCount > 0 && (
              <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-semibold">
                  Soal akan dilepas dari {usage.examCount} ujian.
                </p>
                <p className="mt-1">
                  Ujian tetap ada, tetapi jumlah soalnya berkurang:{" "}
                  {usage.exams.map((exam) => exam.title).join(", ")}.
                </p>
              </div>
            )}

            {usage.canDelete && willEmptyExam && (
              <div className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <p className="font-semibold">Peringatan:</p>
                <p className="mt-1">
                  Ada ujian yang akan kehilangan seluruh soalnya. Periksa
                  kembali sebelum menghapus.
                </p>
              </div>
            )}

            {usage.canDelete && usage.examCount === 0 && (
              <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Soal ini belum dipakai pada ujian mana pun.
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
            {deleting ? "Menghapus..." : "Hapus Soal"}
          </button>
        </div>
      </div>
    </div>
  );
}
