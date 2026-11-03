import { useState, type FormEvent } from "react";
import type {
  AdminQuestion,
  QuestionInput,
  QuestionType,
  QuestionUsage,
} from "../lib/types";

type Props = {
  mode: "create" | "edit";
  subjectId: string;
  question: AdminQuestion | null;
  usage: QuestionUsage | null;
  loadingUsage: boolean;
  saving: boolean;
  serverError: string | null;
  onClose: () => void;
  onSubmit: (input: QuestionInput) => void | Promise<void>;
};

type OptionDraft = {
  key: string;
  id?: string;
  text: string;
  fraction: number;
  feedback: string;
  hasImage: boolean;
};

type PairDraft = {
  key: string;
  id?: string;
  left: string;
  right: string;
};

type AcceptedDraft = {
  key: string;
  text: string;
  fraction: number;
};

const TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: "multiple_choice", label: "Pilihan ganda" },
  { value: "multiple_response", label: "Multiple response" },
  { value: "true_false", label: "Benar / salah" },
  { value: "matching", label: "Matching" },
  { value: "short_answer", label: "Isian singkat" },
  { value: "numerical", label: "Numerik" },
  { value: "essay", label: "Essay" },
];

const OPTION_TYPES = new Set<QuestionType>([
  "multiple_choice",
  "multiple_response",
  "true_false",
]);

let rowCounter = 0;
function newKey(): string {
  rowCounter += 1;
  return `row-${Date.now()}-${rowCounter}`;
}

function buildOptions(
  question: AdminQuestion | null,
  type: QuestionType,
): OptionDraft[] {
  if (!OPTION_TYPES.has(type)) return [];

  const existing =
    question?.questionType === type ? question.options : [];

  if (existing.length > 0) {
    const drafts = existing.map((option) => ({
      key: newKey(),
      id: option.id,
      text: option.optionText ?? "",
      fraction: Math.round(Number(option.fraction) * 100),
      feedback: option.feedback ?? "",
      hasImage: Boolean(option.imageUrl),
    }));

    if (type === "true_false" && !drafts.some((option) => option.fraction > 0)) {
      drafts[0]!.fraction = 100;
    }
    return drafts;
  }

  if (type === "true_false") {
    return [
      {
        key: newKey(),
        text: "Benar",
        fraction: 100,
        feedback: "",
        hasImage: false,
      },
      {
        key: newKey(),
        text: "Salah",
        fraction: 0,
        feedback: "",
        hasImage: false,
      },
    ];
  }

  return [0, 1, 2, 3].map((index) => ({
    key: newKey(),
    text: "",
    fraction: index === 0 ? 100 : 0,
    feedback: "",
    hasImage: false,
  }));
}

function buildPairs(
  question: AdminQuestion | null,
  type: QuestionType,
): PairDraft[] {
  if (type !== "matching") return [];

  if (
    question?.questionType === "matching" &&
    question.matchPairs.length > 0
  ) {
    return question.matchPairs.map((pair) => ({
      key: newKey(),
      id: pair.id,
      left: pair.leftText,
      right: pair.rightText,
    }));
  }

  return [0, 1].map(() => ({ key: newKey(), left: "", right: "" }));
}

function buildAccepted(
  question: AdminQuestion | null,
  type: QuestionType,
): AcceptedDraft[] {
  if (type !== "short_answer") {
    return [{ key: newKey(), text: "", fraction: 100 }];
  }

  const accepted =
    question?.questionType === "short_answer"
      ? (
          question.answerKey as
            | { accepted?: { text?: string; fraction?: number }[] }
            | null
            | undefined
        )?.accepted
      : undefined;

  if (Array.isArray(accepted) && accepted.length > 0) {
    return accepted.map((answer) => ({
      key: newKey(),
      text: answer.text ?? "",
      fraction: Math.round(Number(answer.fraction ?? 1) * 100),
    }));
  }

  return [{ key: newKey(), text: "", fraction: 100 }];
}

function buildNumerical(
  question: AdminQuestion | null,
  type: QuestionType,
): { value: string; tolerance: string } {
  if (type === "numerical" && question?.questionType === "numerical") {
    const answerKey = question.answerKey as
      | { value?: number; tolerance?: number }
      | null
      | undefined;
    return {
      value: String(answerKey?.value ?? 0),
      tolerance: String(answerKey?.tolerance ?? 0),
    };
  }
  return { value: "0", tolerance: "0" };
}

function clampPercent(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function QuestionEditorModal({
  mode,
  subjectId,
  question,
  usage,
  loadingUsage,
  saving,
  serverError,
  onClose,
  onSubmit,
}: Props) {
  const initialType = question?.questionType ?? "multiple_choice";
  const initialNumerical = buildNumerical(question, initialType);

  const [questionType, setQuestionType] = useState<QuestionType>(initialType);
  const [questionText, setQuestionText] = useState(question?.questionText ?? "");
  const [points, setPoints] = useState(
    question ? String(Number(question.points)) : "1",
  );
  const [category, setCategory] = useState(question?.category ?? "");
  const [generalFeedback, setGeneralFeedback] = useState(
    question?.generalFeedback ?? "",
  );
  const [options, setOptions] = useState<OptionDraft[]>(() =>
    buildOptions(question, initialType),
  );
  const [pairs, setPairs] = useState<PairDraft[]>(() =>
    buildPairs(question, initialType),
  );
  const [accepted, setAccepted] = useState<AcceptedDraft[]>(() =>
    buildAccepted(question, initialType),
  );
  const [numericalValue, setNumericalValue] = useState(
    initialNumerical.value,
  );
  const [numericalTolerance, setNumericalTolerance] = useState(
    initialNumerical.tolerance,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const disabled =
    saving || loadingUsage || (usage ? !usage.canEdit : false);
  const noSubject = mode === "create" && !subjectId;

  function handleTypeChange(next: QuestionType) {
    setQuestionType(next);
    setLocalError(null);
    setOptions(buildOptions(question, next));
    setPairs(buildPairs(question, next));
    setAccepted(buildAccepted(question, next));
    const numerical = buildNumerical(question, next);
    setNumericalValue(numerical.value);
    setNumericalTolerance(numerical.tolerance);
  }

  function updateOption(key: string, patch: Partial<OptionDraft>) {
    setOptions((previous) =>
      previous.map((option) =>
        option.key === key ? { ...option, ...patch } : option,
      ),
    );
  }

  function addOption() {
    setOptions((previous) =>
      previous.length >= 26
        ? previous
        : [
            ...previous,
            {
              key: newKey(),
              text: "",
              fraction: 0,
              feedback: "",
              hasImage: false,
            },
          ],
    );
  }

  function removeOption(key: string) {
    setOptions((previous) =>
      previous.length <= 2
        ? previous
        : previous.filter((option) => option.key !== key),
    );
  }

  function setTrueFalseAnswer(index: number) {
    setOptions((previous) =>
      previous.map((option, optionIndex) => ({
        ...option,
        fraction: optionIndex === index ? 100 : 0,
      })),
    );
  }

  function updatePair(key: string, patch: Partial<PairDraft>) {
    setPairs((previous) =>
      previous.map((pair) =>
        pair.key === key ? { ...pair, ...patch } : pair,
      ),
    );
  }

  function addPair() {
    setPairs((previous) => [
      ...previous,
      { key: newKey(), left: "", right: "" },
    ]);
  }

  function removePair(key: string) {
    setPairs((previous) =>
      previous.length <= 2
        ? previous
        : previous.filter((pair) => pair.key !== key),
    );
  }

  function updateAccepted(key: string, patch: Partial<AcceptedDraft>) {
    setAccepted((previous) =>
      previous.map((answer) =>
        answer.key === key ? { ...answer, ...patch } : answer,
      ),
    );
  }

  function addAccepted() {
    setAccepted((previous) => [
      ...previous,
      { key: newKey(), text: "", fraction: 100 },
    ]);
  }

  function removeAccepted(key: string) {
    setAccepted((previous) =>
      previous.length <= 1
        ? previous
        : previous.filter((answer) => answer.key !== key),
    );
  }

  function buildInput(): QuestionInput | string {
    const text = questionText.trim();
    if (!text) return "Teks soal wajib diisi.";

    const pointValue = Number(points);
    if (
      !Number.isFinite(pointValue) ||
      pointValue <= 0 ||
      pointValue > 9999.99
    ) {
      return "Poin harus antara 0.01 dan 9999.99.";
    }

    const categoryValue = category.trim();
    if (categoryValue.length > 255) {
      return "Kategori maksimal 255 karakter.";
    }

    const common = {
      questionType,
      questionText: text,
      points: pointValue,
      category: categoryValue || null,
      generalFeedback: generalFeedback.trim() || null,
    };

    switch (questionType) {
      case "multiple_choice":
      case "multiple_response": {
        if (options.length < 2) return "Minimal dua opsi jawaban.";
        if (options.some((option) => !option.text.trim() && !option.hasImage)) {
          return "Teks opsi tidak boleh kosong.";
        }
        if (!options.some((option) => option.fraction > 0)) {
          return "Tandai minimal satu opsi dengan nilai lebih dari 0%.";
        }
        return {
          ...common,
          answerKey: null,
          options: options.map((option) => ({
            id: option.id,
            optionText: option.text.trim(),
            fraction: option.fraction / 100,
            feedback: option.feedback.trim() || null,
          })),
          matchPairs: [],
        };
      }

      case "true_false": {
        if (options.length !== 2) {
          return "Soal benar/salah harus memiliki dua opsi.";
        }
        const correctIndex = options.findIndex(
          (option) => option.fraction > 0,
        );
        if (correctIndex === -1) return "Pilih jawaban yang benar.";
        return {
          ...common,
          answerKey: null,
          options: options.map((option, index) => ({
            id: option.id,
            optionText:
              option.text.trim() || (index === 0 ? "Benar" : "Salah"),
            fraction: index === correctIndex ? 1 : 0,
            feedback: option.feedback.trim() || null,
          })),
          matchPairs: [],
        };
      }

      case "matching": {
        if (pairs.length < 2) return "Minimal dua pasangan matching.";
        if (pairs.some((pair) => !pair.left.trim() || !pair.right.trim())) {
          return "Pasangan matching tidak boleh kosong.";
        }
        return {
          ...common,
          answerKey: null,
          options: [],
          matchPairs: pairs.map((pair) => ({
            id: pair.id,
            leftText: pair.left.trim(),
            rightText: pair.right.trim(),
          })),
        };
      }

      case "short_answer": {
        const answers = accepted.filter((answer) => answer.text.trim());
        if (answers.length === 0) {
          return "Minimal satu jawaban yang diterima.";
        }
        return {
          ...common,
          answerKey: {
            accepted: answers.map((answer) => ({
              text: answer.text.trim(),
              fraction: answer.fraction / 100,
            })),
          },
          options: [],
          matchPairs: [],
        };
      }

      case "numerical": {
        if (!numericalValue.trim()) {
          return "Nilai numerik wajib diisi.";
        }
        const value = Number(numericalValue);
        const tolerance = Number(numericalTolerance);
        if (!Number.isFinite(value)) {
          return "Nilai numerik tidak valid.";
        }
        if (!Number.isFinite(tolerance) || tolerance < 0) {
          return "Toleransi harus 0 atau lebih.";
        }
        return {
          ...common,
          answerKey: { value, tolerance },
          options: [],
          matchPairs: [],
        };
      }

      case "essay":
        return {
          ...common,
          answerKey: null,
          options: [],
          matchPairs: [],
        };

      default:
        return "Tipe soal tidak dikenal.";
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);

    if (noSubject) {
      setLocalError("Pilih mata pelajaran terlebih dahulu.");
      return;
    }

    const input = buildInput();
    if (typeof input === "string") {
      setLocalError(input);
      return;
    }

    void onSubmit(input);
  }

  const showOptionEditor =
    questionType === "multiple_choice" ||
    questionType === "multiple_response";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
      <form
        onSubmit={handleSubmit}
        className="my-6 w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Bank Soal
            </p>
            <h2 className="text-xl font-bold text-slate-900">
              {mode === "create" ? "Tambah Soal Manual" : "Edit Soal"}
            </h2>
            {question && (
              <p className="mt-1 max-w-xl text-xs text-slate-500">
                Sumber: {question.sourceFormat}
                {question.sourceRef ? ` · ${question.sourceRef}` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Tutup
          </button>
        </div>

        {loadingUsage && (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Memeriksa pemakaian soal...
          </div>
        )}

        {usage && !usage.canEdit && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <p className="font-semibold">Soal tidak dapat disunting.</p>
            <p className="mt-1">{usage.reasons.join(" ")}</p>
          </div>
        )}

        {usage && usage.canEdit && usage.examCount > 0 && (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Soal terpasang pada {usage.examCount} ujian (
            {usage.exams.map((exam) => exam.title).join(", ")}). Perubahan akan
            langsung terlihat pada ujian tersebut.
          </div>
        )}

        {noSubject && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Pilih mata pelajaran aktif sebelum menambah soal.
          </div>
        )}

        <fieldset disabled={disabled} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div>
              <label className="label">Tipe soal</label>
              <select
                className="input"
                value={questionType}
                onChange={(event) =>
                  handleTypeChange(event.target.value as QuestionType)
                }
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Poin</label>
              <input
                type="number"
                min={0.01}
                max={9999.99}
                step={0.01}
                className="input"
                value={points}
                onChange={(event) => setPoints(event.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">Teks soal</label>
            <textarea
              className="input min-h-32"
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
              placeholder="Tulis teks soal. HTML diperbolehkan dan akan disanitasi saat ditampilkan."
              required
            />
            {questionText.includes("<") && (
              <p className="mt-1 text-xs text-slate-400">
                Pratinjau: {plainText(questionText)}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Kategori (opsional)</label>
              <input
                className="input"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                maxLength={255}
              />
            </div>
            <div>
              <label className="label">General feedback (opsional)</label>
              <textarea
                className="input min-h-20"
                value={generalFeedback}
                onChange={(event) => setGeneralFeedback(event.target.value)}
              />
            </div>
          </div>

          {showOptionEditor && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="label mb-0">Opsi jawaban</p>
                  <p className="text-xs text-slate-500">
                    Nilai 100% = benar penuh, 0% = salah. Partial credit boleh
                    digunakan.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={addOption}
                  disabled={options.length >= 26}
                >
                  + Opsi
                </button>
              </div>

              {options.map((option, index) => (
                <div
                  key={option.key}
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-[1fr_110px_auto]">
                    <div className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-sm font-bold text-slate-600">
                        {String.fromCharCode(65 + index)}.
                      </span>
                      <input
                        className="input"
                        value={option.text}
                        onChange={(event) =>
                          updateOption(option.key, {
                            text: event.target.value,
                          })
                        }
                        placeholder="Teks opsi"
                      />
                    </div>
                    <div>
                      <label className="label">Nilai (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        className="input"
                        value={option.fraction}
                        onChange={(event) =>
                          updateOption(option.key, {
                            fraction: clampPercent(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="btn-secondary px-3 py-2 text-xs"
                        onClick={() => removeOption(option.key)}
                        disabled={options.length <= 2}
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <input
                      className="input"
                      value={option.feedback}
                      onChange={(event) =>
                        updateOption(option.key, {
                          feedback: event.target.value,
                        })
                      }
                      placeholder="Feedback untuk opsi ini (opsional)"
                    />
                  </div>
                  {option.hasImage && (
                    <p className="mt-1 text-xs text-slate-400">
                      Gambar opsi yang sudah ada tetap dipertahankan.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {questionType === "true_false" && (
            <div className="space-y-2">
              <p className="label mb-0">Jawaban benar</p>
              {options.map((option, index) => (
                <label
                  key={option.key}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                    option.fraction > 0
                      ? "border-brand-500 bg-brand-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    checked={option.fraction > 0}
                    onChange={() => setTrueFalseAnswer(index)}
                  />
                  <span className="text-sm font-medium text-slate-700">
                    {index === 0 ? "Benar" : "Salah"}
                  </span>
                </label>
              ))}
            </div>
          )}

          {questionType === "matching" && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="label mb-0">Pasangan matching</p>
                  <p className="text-xs text-slate-500">
                    Setiap baris adalah satu pasangan kiri dan kanan.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={addPair}
                >
                  + Pasangan
                </button>
              </div>

              {pairs.map((pair, index) => (
                <div
                  key={pair.key}
                  className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <input
                    className="input"
                    value={pair.left}
                    onChange={(event) =>
                      updatePair(pair.key, { left: event.target.value })
                    }
                    placeholder={`Kiri ${index + 1}`}
                  />
                  <input
                    className="input"
                    value={pair.right}
                    onChange={(event) =>
                      updatePair(pair.key, { right: event.target.value })
                    }
                    placeholder={`Kanan ${index + 1}`}
                  />
                  <div className="flex items-end">
                    <button
                      type="button"
                      className="btn-secondary px-3 py-2 text-xs"
                      onClick={() => removePair(pair.key)}
                      disabled={pairs.length <= 2}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {questionType === "short_answer" && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="label mb-0">Jawaban yang diterima</p>
                  <p className="text-xs text-slate-500">
                    Nilai menentukan skor untuk jawaban yang cocok.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={addAccepted}
                >
                  + Jawaban
                </button>
              </div>

              {accepted.map((answer) => (
                <div
                  key={answer.key}
                  className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_110px_auto]"
                >
                  <input
                    className="input"
                    value={answer.text}
                    onChange={(event) =>
                      updateAccepted(answer.key, {
                        text: event.target.value,
                      })
                    }
                    placeholder="Teks jawaban"
                  />
                  <div>
                    <label className="label">Nilai (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className="input"
                      value={answer.fraction}
                      onChange={(event) =>
                        updateAccepted(answer.key, {
                          fraction: clampPercent(event.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      className="btn-secondary px-3 py-2 text-xs"
                      onClick={() => removeAccepted(answer.key)}
                      disabled={accepted.length <= 1}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {questionType === "numerical" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Nilai jawaban</label>
                <input
                  type="number"
                  step="any"
                  className="input"
                  value={numericalValue}
                  onChange={(event) => setNumericalValue(event.target.value)}
                />
              </div>
              <div>
                <label className="label">Toleransi</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="input"
                  value={numericalTolerance}
                  onChange={(event) =>
                    setNumericalTolerance(event.target.value)
                  }
                />
              </div>
            </div>
          )}

          {questionType === "essay" && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Soal essay tidak memiliki kunci jawaban otomatis; jawaban peserta
              dinilai manual melalui tab Nilai Essay.
            </div>
          )}
        </fieldset>

        {localError && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {localError}
          </div>
        )}
        {serverError && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {serverError}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={disabled || noSubject}
          >
            {saving
              ? "Menyimpan..."
              : mode === "create"
                ? "Simpan Soal"
                : "Simpan Perubahan"}
          </button>
        </div>
      </form>
    </div>
  );
}
