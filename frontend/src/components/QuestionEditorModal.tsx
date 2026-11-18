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

import {
  TYPE_OPTIONS,
  buildAccepted,
  buildNumerical,
  buildOptions,
  buildPairs,
  clampPercent,
  newKey,
  type AcceptedDraft,
  type OptionDraft,
  type PairDraft,
} from "./question-editor/drafts";
import OptionListEditor from "./question-editor/OptionListEditor";
import TrueFalseEditor from "./question-editor/TrueFalseEditor";
import MatchingEditor from "./question-editor/MatchingEditor";
import AcceptedAnswerEditor from "./question-editor/AcceptedAnswerEditor";

import { stripHtml } from "../lib/format";

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
                Pratinjau: {stripHtml(questionText)}
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
            <>
              <OptionListEditor
                options={options}
                addOption={addOption}
                updateOption={updateOption}
                removeOption={removeOption}
              />
              {questionType === "multiple_response" && (
                <p className="text-xs text-slate-500">
                  Opsi 0% dianggap salah. Setiap opsi salah yang dipilih
                  mengurangi skor sebesar bagian satu opsi benar.
                </p>
              )}
            </>
          )}

          {questionType === "true_false" && (
            <TrueFalseEditor
              options={options}
              setTrueFalseAnswer={setTrueFalseAnswer}
            />
          )}

          {questionType === "matching" && (
            <MatchingEditor
              pairs={pairs}
              addPair={addPair}
              updatePair={updatePair}
              removePair={removePair}
            />
          )}

          {questionType === "short_answer" && (
            <AcceptedAnswerEditor
              accepted={accepted}
              addAccepted={addAccepted}
              updateAccepted={updateAccepted}
              removeAccepted={removeAccepted}
            />
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
