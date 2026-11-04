import type { OptionDraft } from "./drafts";

type Props = {
  options: OptionDraft[];
  setTrueFalseAnswer: (index: number) => void;
};

export default function TrueFalseEditor({
  options,
  setTrueFalseAnswer,
}: Props) {
  return (
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
  );
}
