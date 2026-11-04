import { createPortal } from "react-dom";
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import QuestionCard from "../QuestionCard";
import { formatTime, isAnswered } from "../../lib/exam-utils";
import type {
  AnswerState,
  SessionPayload,
  SessionQuestion,
} from "../../lib/types";
import LockOverlay from "./LockOverlay";
import type { OverlayState } from "./types";

type Props = {
  payload: SessionPayload;
  answeredCount: number;
  remaining: number;
  strikes: number;
  online: boolean;
  current: number;
  setCurrent: Dispatch<SetStateAction<number>>;
  answers: Record<string, AnswerState>;
  submitting: boolean;
  submitExam: (force?: boolean) => Promise<void>;
  overlay: OverlayState | null;
  overlayRef: MutableRefObject<boolean>;
  setOverlay: Dispatch<SetStateAction<OverlayState | null>>;
  resumeExam: () => Promise<void>;
  handleReconnect: () => Promise<void>;
  handleSelectOption: (question: SessionQuestion, optionId: string) => void;
  handleToggleMulti: (question: SessionQuestion, optionId: string) => void;
  handleTextChange: (question: SessionQuestion, text: string) => void;
  handleNumberChange: (question: SessionQuestion, value: number | null) => void;
  handleMatchChange: (
    question: SessionQuestion,
    leftId: string,
    rightId: string,
  ) => void;
  handleToggleFlag: (question: SessionQuestion) => void;
};

export default function ExamWorkspace({
  payload,
  answeredCount,
  remaining,
  strikes,
  online,
  current,
  setCurrent,
  answers,
  submitting,
  submitExam,
  overlay,
  overlayRef,
  setOverlay,
  resumeExam,
  handleReconnect,
  handleSelectOption,
  handleToggleMulti,
  handleTextChange,
  handleNumberChange,
  handleMatchChange,
  handleToggleFlag,
}: Props) {
  const currentQuestion = payload.questions[current];
  const currentAnswer = currentQuestion
    ? answers[currentQuestion.id]
    : undefined;

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              {payload.exam.title}
            </p>
            <p className="text-xs text-slate-500">
              {answeredCount}/{payload.questions.length} soal terjawab
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`rounded-xl px-3 py-1.5 text-center ${
                remaining <= 300
                  ? "bg-rose-50 text-rose-700"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide">
                Sisa waktu
              </p>
              <p className="font-mono text-lg font-bold leading-none">
                {formatTime(remaining)}
              </p>
            </div>

            <div className="rounded-xl bg-amber-50 px-3 py-1.5 text-center text-amber-700">
              <p className="text-[10px] font-semibold uppercase tracking-wide">
                Pelanggaran
              </p>
              <p className="text-lg font-bold leading-none">
                {strikes}/{payload.exam.maxStrikes}
              </p>
            </div>

            <span
              className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline ${
                online
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
            >
              {online ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[220px_1fr]">
        <aside className="card h-fit lg:sticky lg:top-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Navigasi soal
          </p>
          <div className="grid grid-cols-6 gap-2 lg:grid-cols-4">
            {payload.questions.map((question, index) => {
              const answered = isAnswered(question, answers[question.id]);
              const flagged = answers[question.id]?.isFlagged;
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setCurrent(index)}
                  className={`flex h-9 items-center justify-center rounded-lg text-sm font-bold transition ${
                    index === current
                      ? "bg-brand-600 text-white"
                      : flagged
                        ? "bg-amber-100 text-amber-800"
                        : answered
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-1.5 text-xs text-slate-500">
            <p>
              <span className="mr-2 inline-block h-3 w-3 rounded bg-emerald-200 align-middle" />
              Terjawab
            </p>
            <p>
              <span className="mr-2 inline-block h-3 w-3 rounded bg-amber-200 align-middle" />
              Ragu-ragu
            </p>
            <p>
              <span className="mr-2 inline-block h-3 w-3 rounded bg-slate-200 align-middle" />
              Belum dijawab
            </p>
          </div>
        </aside>

        <section className="space-y-4">
          {currentQuestion && currentAnswer && (
            <QuestionCard
              question={currentQuestion}
              answer={currentAnswer}
              number={current + 1}
              onSelectOption={(optionId) =>
                handleSelectOption(currentQuestion, optionId)
              }
              onToggleMulti={(optionId) =>
                handleToggleMulti(currentQuestion, optionId)
              }
              onChangeText={(text) =>
                handleTextChange(currentQuestion, text)
              }
              onChangeNumber={(value) =>
                handleNumberChange(currentQuestion, value)
              }
              onMatchChange={(leftId, rightId) =>
                handleMatchChange(currentQuestion, leftId, rightId)
              }
              onToggleFlag={() => handleToggleFlag(currentQuestion)}
            />
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="btn-secondary"
              disabled={current === 0}
              onClick={() => setCurrent((value) => Math.max(0, value - 1))}
            >
              Sebelumnya
            </button>

            <button
              type="button"
              className="btn-secondary"
              disabled={current >= payload.questions.length - 1}
              onClick={() =>
                setCurrent((value) =>
                  Math.min(payload.questions.length - 1, value + 1),
                )
              }
            >
              Berikutnya
            </button>
          </div>
        </section>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <p className="text-xs text-slate-500">
            Auto-save aktif. Jangan berpindah aplikasi atau keluar fullscreen.
          </p>
          <button
            type="button"
            className="btn-primary"
            disabled={submitting}
            onClick={() => void submitExam(false)}
          >
            {submitting ? "Mengumpulkan..." : "Kumpulkan Jawaban"}
          </button>
        </div>
      </footer>

      {overlay &&
        typeof document !== "undefined" &&
        document.getElementById("modal-root") &&
        createPortal(
          <LockOverlay
            overlay={overlay}
            submitting={submitting}
            onResume={() => void resumeExam()}
            onConfirmSubmit={() => void submitExam(true)}
            onCancel={() => {
              overlayRef.current = false;
              setOverlay(null);
            }}
            onReconnect={() => void handleReconnect()}
          />,
          document.getElementById("modal-root")!,
        )}
    </div>
  );
}
