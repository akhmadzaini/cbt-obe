import type { Dispatch, SetStateAction } from "react";
import { formatDateTime } from "../../lib/format";
import { gradingStatusLabel, sessionStatusLabel } from "../../lib/labels";
import type { ExamResultRow, ExamSummary, User } from "../../lib/types";

type Props = {
  exportMode: "summary" | "category";
  setExportMode: Dispatch<SetStateAction<"summary" | "category">>;
  resultsExamId: string;
  exporting: boolean;
  handleExportResults: () => Promise<void>;
  resultsLoading: boolean;
  loadResults: () => Promise<void>;
  setResultsExamId: Dispatch<SetStateAction<string>>;
  exams: ExamSummary[];
  resultsStatus: string;
  setResultsStatus: Dispatch<SetStateAction<string>>;
  resultsSearch: string;
  setResultsSearch: Dispatch<SetStateAction<string>>;
  results: ExamResultRow[];
  finishedResults: ExamResultRow[];
  totalViolations: number;
  averageScore: number | null;
  user: User | null;
  resultDetailLoading: boolean;
  handleOpenResult: (sessionId: string) => Promise<void>;
  openSessionReset: (row: ExamResultRow) => void;
  openSessionCancel: (row: ExamResultRow) => void;
};

export default function ResultsTab({
  exportMode,
  setExportMode,
  resultsExamId,
  exporting,
  handleExportResults,
  resultsLoading,
  loadResults,
  setResultsExamId,
  exams,
  resultsStatus,
  setResultsStatus,
  resultsSearch,
  setResultsSearch,
  results,
  finishedResults,
  totalViolations,
  averageScore,
  user,
  resultDetailLoading,
  handleOpenResult,
  openSessionReset,
  openSessionCancel,
}: Props) {
  return (
          <section className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Skor Peserta
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Rekap nilai, status pengerjaan, dan jumlah pelanggaran per sesi
                  ujian. Ekspor Excel memuat sesi yang sudah selesai.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <select
                  className="input w-56"
                  value={exportMode}
                  onChange={(event) =>
                    setExportMode(
                      event.target.value === "category" ? "category" : "summary",
                    )
                  }
                  disabled={!resultsExamId || exporting}
                  aria-label="Format ekspor nilai"
                >
                  <option value="summary">Ringkasan per peserta</option>
                  <option value="category">Per kategori soal</option>
                </select>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!resultsExamId || exporting}
                  onClick={() => void handleExportResults()}
                >
                  {exporting ? "Menyiapkan..." : "Ekspor Excel"}
                </button>
                <button
                  className="btn-secondary"
                  disabled={resultsLoading || exporting}
                  onClick={() => void loadResults()}
                >
                  {resultsLoading ? "Memuat..." : "Muat ulang"}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Ujian</label>
                <select
                  className="input"
                  value={resultsExamId}
                  onChange={(event) => setResultsExamId(event.target.value)}
                >
                  <option value="">— pilih ujian —</option>
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Status pengerjaan</label>
                <select
                  className="input"
                  value={resultsStatus}
                  onChange={(event) => setResultsStatus(event.target.value)}
                >
                  <option value="all">Semua</option>
                  <option value="finished">Selesai</option>
                  <option value="in_progress">Sedang berjalan</option>
                  <option value="suspended">Ditangguhkan</option>
                </select>
              </div>
              <div>
                <label className="label">Cari peserta</label>
                <input
                  className="input"
                  value={resultsSearch}
                  onChange={(event) => setResultsSearch(event.target.value)}
                  placeholder="Nama atau username"
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Sesi
                </p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {results.length}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Selesai
                </p>
                <p className="mt-1 text-xl font-bold text-emerald-800">
                  {finishedResults.length}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Berjalan
                </p>
                <p className="mt-1 text-xl font-bold text-amber-800">
                  {results.length - finishedResults.length}
                </p>
              </div>
              <div className="rounded-xl bg-rose-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                  Pelanggaran
                </p>
                <p className="mt-1 text-xl font-bold text-rose-800">
                  {totalViolations}
                </p>
              </div>
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                  Rata-rata
                </p>
                <p className="mt-1 text-xl font-bold text-brand-800">
                  {averageScore === null ? "-" : averageScore.toFixed(2)}
                </p>
              </div>
            </div>

            {!resultsExamId && (
              <p className="mt-4 text-sm text-slate-500">
                Pilih ujian untuk melihat skor peserta.
              </p>
            )}

            {resultsExamId && !resultsLoading && results.length === 0 && (
              <p className="mt-4 text-sm text-slate-500">
                Belum ada sesi peserta untuk ujian ini.
              </p>
            )}

            {results.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-4">Peserta</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Skor</th>
                      <th className="py-2 pr-4">Pelanggaran</th>
                      <th className="py-2 pr-4">Selesai</th>
                      <th className="py-2 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row) => (
                      <tr
                        key={row.sessionId}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 pr-4">
                          <p className="font-semibold text-slate-800">
                            {row.studentName}
                          </p>
                          <p className="font-mono text-xs text-slate-500">
                            {row.username}
                          </p>
                        </td>
                        <td className="py-2 pr-4">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              row.status === "finished"
                                ? "bg-emerald-50 text-emerald-700"
                                : row.status === "suspended"
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {sessionStatusLabel(row.status)}
                          </span>
                          <span className="ml-2 text-xs text-slate-500">
                            {gradingStatusLabel(row.gradingStatus)}
                          </span>
                          {row.finishedReason === "force_submit" && (
                            <span className="mt-1 block text-xs font-semibold text-rose-600">
                              Dikumpulkan paksa
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <span className="font-semibold text-slate-800">
                            {row.score ?? "0"}
                          </span>
                          <span className="text-xs text-slate-500">
                            {" "}
                            / {row.maxScore}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          <span
                            className={
                              row.violationCount > 0
                                ? "font-semibold text-rose-700"
                                : "text-slate-500"
                            }
                          >
                            {row.violationCount} total
                          </span>
                          <span className="block text-xs text-slate-500">
                            {row.strikeCount} strike
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-slate-500">
                          {formatDateTime(row.finishedAt)}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={resultDetailLoading}
                              onClick={() => void handleOpenResult(row.sessionId)}
                            >
                              Detail
                            </button>
                            {user?.role === "admin" &&
                              row.status === "finished" && (
                                <button
                                  type="button"
                                  className="rounded-lg border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                  onClick={() => openSessionCancel(row)}
                                >
                                  Batalkan Submission
                                </button>
                              )}
                            {user?.role === "admin" &&
                              row.status === "finished" &&
                              row.finishedReason === "force_submit" && (
                                <button
                                  type="button"
                                  className="rounded-lg border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                                  onClick={() => openSessionReset(row)}
                                >
                                  Reset
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
  );
}
