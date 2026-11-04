import type { FormEvent } from "react";
import type { AdminQuestion } from "../../lib/types";
import { stripHtml } from "../../lib/format";
import type { ImportRow } from "./types";

type Props = {
  busy: boolean;
  subjectId: string;
  imports: ImportRow[];
  questions: AdminQuestion[];
  uploadingQuestionId: string | null;
  handleImport: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  openCreateQuestion: () => void;
  openEditQuestion: (question: AdminQuestion) => Promise<void>;
  openDeleteQuestion: (question: AdminQuestion) => Promise<void>;
  handleUploadImage: (questionId: string, file: File | null) => Promise<void>;
};

export default function QuestionBankTab({
  busy,
  subjectId,
  imports,
  questions,
  uploadingQuestionId,
  handleImport,
  openCreateQuestion,
  openEditQuestion,
  openDeleteQuestion,
  handleUploadImage,
}: Props) {
  return (
          <>
            <section className="card">
              <h2 className="text-base font-bold text-slate-900">
                Import Soal AIKEN / GIFT
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                File .txt berisi soal. Soal akan ditambahkan ke mapel aktif.
              </p>

              <form
                onSubmit={handleImport}
                className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto]"
              >
                <div>
                  <label className="label">Format</label>
                  <select name="format" className="input" defaultValue="gift">
                    <option value="gift">GIFT</option>
                    <option value="aiken">AIKEN</option>
                  </select>
                </div>

                <div>
                  <label className="label">File soal</label>
                  <input
                    type="file"
                    name="file"
                    accept=".txt,text/plain"
                    className="input py-2"
                    required
                  />
                </div>

                <input type="hidden" name="subjectId" value={subjectId} />

                <div className="flex items-end">
                  <button
                    className="btn-primary w-full"
                    type="submit"
                    disabled={busy || !subjectId}
                  >
                    {busy ? "Mengimpor..." : "Import"}
                  </button>
                </div>
              </form>

              {imports.length > 0 && (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="pb-2">File</th>
                        <th className="pb-2">Format</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Soal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {imports.slice(0, 8).map((row) => (
                        <tr key={row.id}>
                          <td className="py-2 pr-3 text-slate-700">
                            {row.originalFilename ?? "-"}
                          </td>
                          <td className="py-2 pr-3 uppercase text-slate-500">
                            {row.format}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                              {row.status}
                            </span>
                          </td>
                          <td className="py-2 text-slate-500">
                            {row.importedQuestions}/{row.totalQuestions}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Daftar Soal ({questions.length})
                </h2>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={openCreateQuestion}
                  disabled={!subjectId}
                >
                  Tambah Soal
                </button>
              </div>

              {questions.length === 0 && (
                <p className="mt-3 text-sm text-slate-500">
                  Belum ada soal untuk mapel ini.
                </p>
              )}

              <div className="mt-3 space-y-2">
                {questions.map((question, index) => (
                  <div
                    key={question.id}
                    className="rounded-xl border border-slate-200 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">
                        {question.questionType}
                      </span>
                      <span>{question.points} poin</span>
                      {question.category && <span>· {question.category}</span>}
                      <span>· {question.sourceFormat}</span>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50"
                          onClick={() => void openEditQuestion(question)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-rose-200 px-2 py-1 font-semibold text-rose-600 hover:bg-rose-50"
                          onClick={() => void openDeleteQuestion(question)}
                        >
                          Hapus
                        </button>
                        <label className="cursor-pointer rounded-lg border border-slate-200 px-2 py-1 font-semibold text-brand-600 hover:bg-slate-50">
                          {uploadingQuestionId === question.id
                            ? "Mengunggah..."
                            : question.imageUrl
                              ? "Ganti gambar"
                              : "Upload gambar"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            disabled={uploadingQuestionId !== null}
                            onChange={(event) => {
                              void handleUploadImage(
                                question.id,
                                event.target.files?.[0] ?? null,
                              );
                              event.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-800">
                      {index + 1}. {stripHtml(question.questionText)}
                    </p>
                    {question.imageUrl && (
                      <img
                        src={question.imageUrl}
                        alt="Gambar soal"
                        className="mt-2 max-h-32 rounded-lg border border-slate-200 object-contain"
                      />
                    )}
                    {question.options.length > 0 && (
                      <ul className="mt-1 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                        {question.options.map((option) => (
                          <li key={option.id}>
                            <span className="font-semibold">
                              {option.label}.
                            </span>{" "}
                            {stripHtml(option.optionText ?? "")}
                            {Number(option.fraction) > 0 && (
                              <span className="ml-1 font-semibold text-emerald-600">
                                ✓
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
  );
}
