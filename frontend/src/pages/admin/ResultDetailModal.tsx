import { formatDateTime, stripHtml } from "../../lib/format";
import { sessionStatusLabel, violationTypeLabel } from "../../lib/labels";
import type { ExamResultDetail } from "../../lib/types";

type Props = {
  resultDetail: ExamResultDetail | null;
  onClose: () => void;
};

export default function ResultDetailModal({ resultDetail, onClose }: Props) {
  if (!resultDetail) return null;

  return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
          <div className="my-6 w-full max-w-4xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                  Detail Hasil
                </p>
                <h2 className="text-lg font-bold text-slate-900">
                  {resultDetail.session.studentName}
                </h2>
                <p className="text-sm text-slate-500">
                  {resultDetail.session.username} ·{" "}
                  {resultDetail.session.examTitle}
                  {resultDetail.session.subjectName
                    ? ` · ${resultDetail.session.subjectName}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
              >
                Tutup
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Skor
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {resultDetail.session.score ?? "0"} /{" "}
                  {resultDetail.session.maxScore}
                </p>
              </div>
              <div className="rounded-xl bg-rose-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                  Total pelanggaran
                </p>
                <p className="mt-1 text-lg font-bold text-rose-800">
                  {resultDetail.session.violationCount}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Strike
                </p>
                <p className="mt-1 text-lg font-bold text-amber-800">
                  {resultDetail.session.strikeCount}
                </p>
              </div>
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                  Status
                </p>
                <p className="mt-1 text-lg font-bold text-brand-800">
                  {sessionStatusLabel(resultDetail.session.status)}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-bold text-slate-900">
                Pelanggaran ({resultDetail.violations.length})
              </h3>
              {resultDetail.violations.length === 0 && (
                <p className="mt-2 text-sm text-slate-500">
                  Tidak ada pelanggaran tercatat.
                </p>
              )}
              <div className="mt-2 space-y-2">
                {resultDetail.violations.map((violation) => (
                  <div
                    key={violation.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50/60 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-rose-800">
                        {violationTypeLabel(violation.violationType)}
                      </p>
                      <p className="text-xs text-rose-700/80">
                        {formatDateTime(violation.timestamp)} · strike{" "}
                        {violation.strikeNumber}
                      </p>
                    </div>
                    {violation.screenshotUrl && (
                      <a
                        className="text-xs font-semibold text-brand-700 underline"
                        href={violation.screenshotUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Lihat bukti
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-bold text-slate-900">
                Jawaban ({resultDetail.answers.length}/
                {resultDetail.questions.length})
              </h3>
              <div className="mt-2 space-y-3">
                {resultDetail.questions.map((question) => {
                  const answer = resultDetail.answers.find(
                    (item) => item.questionId === question.id,
                  );
                  return (
                    <div
                      key={question.id}
                      className="rounded-xl border border-slate-200 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">
                          {question.orderIndex}. {stripHtml(question.questionText)}
                        </p>
                        <span className="text-xs font-semibold text-slate-500">
                          {answer?.scoreAwarded ?? "-"} / {question.points}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
                        {renderAnswerText(question, answer)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        {answer?.isFlagged && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                            Ditandai
                          </span>
                        )}
                        {question.questionType === "essay" &&
                          answer?.scoreAwarded === null && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                              Belum dinilai
                            </span>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
  );
}

function renderAnswerText(
  question: ExamResultDetail["questions"][number],
  answer: ExamResultDetail["answers"][number] | undefined,
): string {
  if (!answer) return "(tidak dijawab)";

  if (question.questionType === "multiple_choice") {
    const option = question.options.find(
      (item) => item.id === answer.selectedOptionId,
    );
    if (option) {
      const text = option.optionText ? stripHtml(option.optionText) : "";
      return `${option.label}. ${text}`.trim();
    }
  }

  if (question.questionType === "multiple_response") {
    const payload = answer.answerPayload ?? {};
    const ids = Array.isArray((payload as Record<string, unknown>).option_ids)
      ? ((payload as Record<string, unknown>).option_ids as string[])
      : [];
    if (ids.length === 0 && answer.selectedOptionId) ids.push(answer.selectedOptionId);
    const labels = question.options
      .filter((item) => ids.includes(item.id))
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((item) => {
        const text = item.optionText ? stripHtml(item.optionText) : "";
        return `${item.label}. ${text}`.trim();
      });
    return labels.length > 0 ? labels.join("; ") : "(tidak dijawab)";
  }

  if (question.questionType === "true_false") {
    if (answer.selectedOptionId) {
      const option = question.options.find(
        (item) => item.id === answer.selectedOptionId,
      );
      return option?.label ?? answer.selectedOptionId;
    }
  }

  if (question.questionType === "matching") {
    const payload = answer.answerPayload ?? {};
    const mapping =
      payload.mapping && typeof payload.mapping === "object"
        ? (payload.mapping as Record<string, string>)
        : {};
    const entries = question.matchPairs
      .map((pair) => {
        const rightId = mapping[pair.id];
        const right = question.matchPairs.find((item) => item.id === rightId);
        if (rightId && right) {
          return `${stripHtml(pair.leftText)} -> ${stripHtml(right.rightText)}`;
        }
        return null;
      })
      .filter((value): value is string => Boolean(value));
    return entries.length > 0 ? entries.join("; ") : "(tidak dijawab)";
  }

  if (question.questionType === "short_answer") {
    const text = answerPayloadText(answer);
    if (text) return text;
  }

  if (question.questionType === "numerical") {
    const payload = answer.answerPayload ?? {};
    const value = (payload as Record<string, unknown>).value;
    if (value !== undefined && value !== null && String(value).trim())
      return String(value);
  }

  if (question.questionType === "essay") {
    const text = answerPayloadText(answer);
    if (text) return text;
  }

  if (answer.selectedOptionId) {
    const option = question.options.find(
      (item) => item.id === answer.selectedOptionId,
    );
    return option?.optionText
      ? stripHtml(option.optionText)
      : option?.label ?? answer.selectedOptionId;
  }

  return "(tidak dijawab)";
}

function answerPayloadText(
  answer: ExamResultDetail["answers"][number] | undefined,
): string {
  const payload = (answer?.answerPayload ?? {}) as Record<string, unknown>;
  // Frontend menyimpan jawaban teks sebagai { text }; { value } dipertahankan
  // sebagai fallback untuk data lama.
  for (const key of ["text", "value"] as const) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
