import DOMPurify from "dompurify";
import type { AnswerState, SessionQuestion } from "../lib/types";

type Props = {
  question: SessionQuestion;
  answer: AnswerState;
  number: number;
  onSelectOption: (optionId: string) => void;
  onToggleMulti: (optionId: string) => void;
  onChangeText: (text: string) => void;
  onChangeNumber: (value: number | null) => void;
  onMatchChange: (leftId: string, rightId: string) => void;
  onToggleFlag: () => void;
};

function Html({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value) }}
    />
  );
}

export default function QuestionCard({
  question,
  answer,
  number,
  onSelectOption,
  onToggleMulti,
  onChangeText,
  onChangeNumber,
  onMatchChange,
  onToggleFlag,
}: Props) {
  const payload = answer.answerPayload ?? {};
  const optionIds = Array.isArray(payload.option_ids)
    ? (payload.option_ids as string[])
    : [];
  const mapping =
    payload.mapping && typeof payload.mapping === "object"
      ? (payload.mapping as Record<string, string>)
      : {};
  const textValue = typeof payload.text === "string" ? payload.text : "";
  const numberValue =
    typeof payload.value === "number" ? String(payload.value) : "";

  return (
    <div className="card">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
            {number}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {question.questionType.replace(/_/g, " ")} · {question.points} poin
            </p>
            <div className="mt-1 text-base font-medium text-slate-900">
              <Html value={question.questionText} />
            </div>
            {question.imageUrl && (
              <img
                src={question.imageUrl}
                alt="Ilustrasi soal"
                className="mt-3 max-h-72 rounded-xl border border-slate-200 object-contain"
              />
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleFlag}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            answer.isFlagged
              ? "border-amber-400 bg-amber-50 text-amber-700"
              : "border-slate-300 bg-white text-slate-500"
          }`}
        >
          {answer.isFlagged ? "Ditandai" : "Ragu-ragu"}
        </button>
      </div>

      {(question.questionType === "multiple_choice" ||
        question.questionType === "true_false") && (
        <div className="space-y-2">
          {question.options.map((option) => (
            <label
              key={option.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                answer.selectedOptionId === option.id
                  ? "border-brand-500 bg-brand-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name={question.id}
                className="mt-1"
                checked={answer.selectedOptionId === option.id}
                onChange={() => onSelectOption(option.id)}
              />
              <span className="min-w-6 font-bold text-slate-700">
                {option.label}.
              </span>
              <div className="flex-1 text-sm text-slate-700">
                <Html value={option.text} />
                {option.imageUrl && (
                  <img
                    src={option.imageUrl}
                    alt={`Opsi ${option.label}`}
                    className="mt-2 max-h-40 rounded-lg border border-slate-200 object-contain"
                  />
                )}
              </div>
            </label>
          ))}
        </div>
      )}

      {question.questionType === "multiple_response" && (
        <div className="space-y-2">
          <p className="mb-2 text-xs text-slate-500">
            Pilih semua jawaban yang benar.
          </p>
          {question.options.map((option) => (
            <label
              key={option.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                optionIds.includes(option.id)
                  ? "border-brand-500 bg-brand-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={optionIds.includes(option.id)}
                onChange={() => onToggleMulti(option.id)}
              />
              <span className="min-w-6 font-bold text-slate-700">
                {option.label}.
              </span>
              <div className="flex-1 text-sm text-slate-700">
                <Html value={option.text} />
              </div>
            </label>
          ))}
        </div>
      )}

      {question.questionType === "short_answer" && (
        <div>
          <label className="label">Jawaban singkat</label>
          <input
            className="input"
            value={textValue}
            onChange={(event) => onChangeText(event.target.value)}
            placeholder="Tulis jawaban..."
          />
        </div>
      )}

      {question.questionType === "numerical" && (
        <div>
          <label className="label">Jawaban numerik</label>
          <input
            type="number"
            step="any"
            className="input"
            value={numberValue}
            onChange={(event) => {
              const raw = event.target.value;
              onChangeNumber(raw === "" ? null : Number(raw));
            }}
            placeholder="Masukkan angka..."
          />
        </div>
      )}

      {question.questionType === "essay" && (
        <div>
          <label className="label">Jawaban essay</label>
          <textarea
            className="input min-h-40"
            value={textValue}
            onChange={(event) => onChangeText(event.target.value)}
            placeholder="Tulis jawaban lengkap..."
          />
        </div>
      )}

      {question.questionType === "matching" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Pasangkan setiap pernyataan dengan pilihan yang tepat.
          </p>
          {question.matchPairs.map((pair) => (
            <div
              key={pair.id}
              className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2"
            >
              <div className="text-sm font-medium text-slate-700">
                <Html value={pair.leftText} />
              </div>
              <select
                className="input"
                value={mapping[pair.id] ?? ""}
                onChange={(event) =>
                  onMatchChange(pair.id, event.target.value)
                }
              >
                <option value="">— pilih pasangan —</option>
                {question.rightOptions.map((right) => (
                  <option key={right.id} value={right.id}>
                    {right.text}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
