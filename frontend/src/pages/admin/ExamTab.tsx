import type { Dispatch, FormEvent, SetStateAction } from "react";
import ParticipantPicker from "../../components/ParticipantPicker";
import { stripHtml } from "../../lib/format";
import type {
  AdminQuestion,
  ExamSummary,
  Participant,
  Subject,
} from "../../lib/types";
import type { ExamFormState } from "./types";

type Props = {
  subjects: Subject[];
  subjectId: string;
  examForm: ExamFormState;
  setExamForm: Dispatch<SetStateAction<ExamFormState>>;
  selectedQuestionIds: string[];
  setSelectedQuestionIds: Dispatch<SetStateAction<string[]>>;
  questions: AdminQuestion[];
  toggleQuestion: (questionId: string) => void;
  participants: Participant[];
  selectedParticipantIds: string[];
  setSelectedParticipantIds: Dispatch<SetStateAction<string[]>>;
  busy: boolean;
  handleCreateExam: (event: FormEvent) => void;
  exams: ExamSummary[];
  openExamParticipants: (exam: ExamSummary) => Promise<void>;
  handleStatus: (examId: string, status: string) => Promise<void>;
  openExamCancel: (exam: ExamSummary) => Promise<void>;
};

export default function ExamTab({
  subjects,
  subjectId,
  examForm,
  setExamForm,
  selectedQuestionIds,
  setSelectedQuestionIds,
  questions,
  toggleQuestion,
  participants,
  selectedParticipantIds,
  setSelectedParticipantIds,
  busy,
  handleCreateExam,
  exams,
  openExamParticipants,
  handleStatus,
  openExamCancel,
}: Props) {
  return (
          <>
            <section className="card">
              <h2 className="text-base font-bold text-slate-900">
                Buat Ujian Baru
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Mapel aktif:{" "}
                {subjects.find((subject) => subject.id === subjectId)?.name ??
                  "belum dipilih"}
                . Pilih soal dari daftar di bawah.
              </p>

              <form onSubmit={handleCreateExam} className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Judul ujian</label>
                    <input
                      className="input"
                      value={examForm.title}
                      onChange={(event) =>
                        setExamForm((previous) => ({
                          ...previous,
                          title: event.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Durasi (menit)</label>
                    <input
                      type="number"
                      min={1}
                      className="input"
                      value={examForm.durationMinutes}
                      onChange={(event) =>
                        setExamForm((previous) => ({
                          ...previous,
                          durationMinutes: Number(event.target.value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Maks. pelanggaran</label>
                    <input
                      type="number"
                      min={1}
                      className="input"
                      value={examForm.maxStrikes}
                      onChange={(event) =>
                        setExamForm((previous) => ({
                          ...previous,
                          maxStrikes: Number(event.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-wrap items-end gap-4 text-sm text-slate-600">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={examForm.shuffleQuestions}
                        onChange={(event) =>
                          setExamForm((previous) => ({
                            ...previous,
                            shuffleQuestions: event.target.checked,
                          }))
                        }
                      />
                      Acak soal
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={examForm.shuffleOptions}
                        onChange={(event) =>
                          setExamForm((previous) => ({
                            ...previous,
                            shuffleOptions: event.target.checked,
                          }))
                        }
                      />
                      Acak opsi
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={examForm.publish}
                        onChange={(event) =>
                          setExamForm((previous) => ({
                            ...previous,
                            publish: event.target.checked,
                          }))
                        }
                      />
                      Langsung publikasikan
                    </label>
                  </div>
                </div>

                <div>
                  <label className="label">Deskripsi (opsional)</label>
                  <textarea
                    className="input min-h-20"
                    value={examForm.description}
                    onChange={(event) =>
                      setExamForm((previous) => ({
                        ...previous,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">
                      Pilih soal ({selectedQuestionIds.length} dipilih)
                    </p>
                    <button
                      type="button"
                      className="text-xs font-semibold text-brand-600"
                      onClick={() =>
                        setSelectedQuestionIds(
                          questions.map((question) => question.id),
                        )
                      }
                    >
                      Pilih semua
                    </button>
                  </div>

                  <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                    {questions.length === 0 && (
                      <p className="p-2 text-sm text-slate-500">
                        Belum ada soal. Import soal terlebih dahulu.
                      </p>
                    )}
                    {questions.map((question, index) => (
                      <label
                        key={question.id}
                        className="flex cursor-pointer items-start gap-2 rounded-lg p-2 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedQuestionIds.includes(question.id)}
                          onChange={() => toggleQuestion(question.id)}
                        />
                        <span className="text-slate-700">
                          {index + 1}. {stripHtml(question.questionText)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">
                      Peserta ujian ({selectedParticipantIds.length} dipilih)
                    </p>
                  </div>

                  <ParticipantPicker
                    participants={participants}
                    selectedIds={selectedParticipantIds}
                    onChange={setSelectedParticipantIds}
                    emptyMessage="Belum ada akun peserta. Tambahkan peserta di tab Peserta."
                  />

                  {selectedParticipantIds.length === 0 && (
                    <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Belum ada peserta dipilih. Ujian yang dipublikasikan tidak
                      akan muncul bagi siswa sampai peserta ditambahkan.
                    </p>
                  )}
                </div>

                <button
                  className="btn-primary"
                  type="submit"
                  disabled={busy || !subjectId}
                >
                  {busy ? "Menyimpan..." : "Buat Ujian"}
                </button>
              </form>
            </section>

            <section className="card">
              <h2 className="text-base font-bold text-slate-900">
                Daftar Ujian
              </h2>
              <div className="mt-3 space-y-2">
                {exams.length === 0 && (
                  <p className="text-sm text-slate-500">Belum ada ujian.</p>
                )}
                {exams.map((exam) => (
                  <div
                    key={exam.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {exam.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {exam.subjectName ?? "-"} · {exam.durationMinutes} menit
                        · status: {exam.status} ·{" "}
                        {exam.participantCount ?? 0} peserta
                        {exam.status === "published" &&
                          (exam.participantCount ?? 0) === 0 && (
                            <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              Belum ada peserta
                            </span>
                          )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => void openExamParticipants(exam)}
                      >
                        Peserta
                      </button>
                      {exam.status !== "published" && (
                        <button
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() => void handleStatus(exam.id, "published")}
                        >
                          Publikasikan
                        </button>
                      )}
                      {exam.status === "published" && (
                        <button
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() => void handleStatus(exam.id, "archived")}
                        >
                          Arsipkan
                        </button>
                      )}
                      <button
                        className="btn-danger"
                        disabled={busy}
                        onClick={() => void openExamCancel(exam)}
                      >
                        Batalkan
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
  );
}
