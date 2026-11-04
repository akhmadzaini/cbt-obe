import type { Dispatch, SetStateAction } from "react";
import { stripHtml } from "../../lib/format";
import type { PendingGradingSession } from "../../lib/types";

type Props = {
  gradingBusyId: string | null;
  loadPendingGrading: () => Promise<void>;
  pendingGrading: PendingGradingSession[];
  handleGrade: (session: PendingGradingSession) => Promise<void>;
  gradingDrafts: Record<string, string>;
  setGradingDrafts: Dispatch<SetStateAction<Record<string, string>>>;
};

export default function GradingTab({
  gradingBusyId,
  loadPendingGrading,
  pendingGrading,
  handleGrade,
  gradingDrafts,
  setGradingDrafts,
}: Props) {
  return (
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Penilaian Essay
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Sesi dengan jawaban essay yang belum dinilai manual.
                </p>
              </div>
              <button
                className="btn-secondary"
                disabled={gradingBusyId !== null}
                onClick={() => void loadPendingGrading()}
              >
                Muat ulang
              </button>
            </div>

            {pendingGrading.length === 0 && (
              <p className="mt-4 text-sm text-slate-500">
                Tidak ada sesi yang menunggu penilaian essay.
              </p>
            )}

            <div className="mt-4 space-y-4">
              {pendingGrading.map((session) => (
                <div
                  key={session.sessionId}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {session.studentName}{" "}
                        <span className="text-xs font-normal text-slate-400">
                          ({session.username})
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {session.examTitle} · skor otomatis:{" "}
                        {session.score ?? "0"} · status:{" "}
                        {session.gradingStatus}
                      </p>
                    </div>
                    <button
                      className="btn-primary"
                      disabled={gradingBusyId !== null}
                      onClick={() => void handleGrade(session)}
                    >
                      {gradingBusyId === session.sessionId
                        ? "Menyimpan..."
                        : "Simpan Nilai"}
                    </button>
                  </div>

                  <div className="mt-3 space-y-3">
                    {session.essays.map((essay, index) => (
                      <div
                        key={essay.questionId}
                        className="rounded-lg bg-slate-50 p-3"
                      >
                        <p className="text-sm font-medium text-slate-800">
                          {index + 1}. {stripHtml(essay.questionText)}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-2 text-sm text-slate-700">
                          {essay.answerText || "(tidak dijawab)"}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-xs font-semibold text-slate-600">
                            Nilai (maks {essay.points})
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={Number(essay.points)}
                            step="0.01"
                            className="input w-28"
                            disabled={!essay.answerId}
                            value={
                              essay.answerId
                                ? gradingDrafts[essay.answerId] ?? ""
                                : ""
                            }
                            onChange={(event) => {
                              if (!essay.answerId) return;
                              setGradingDrafts((previous) => ({
                                ...previous,
                                [essay.answerId as string]: event.target.value,
                              }));
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
  );
}
