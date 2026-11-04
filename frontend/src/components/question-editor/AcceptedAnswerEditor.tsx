import { clampPercent, type AcceptedDraft } from "./drafts";

type Props = {
  accepted: AcceptedDraft[];
  addAccepted: () => void;
  updateAccepted: (key: string, patch: Partial<AcceptedDraft>) => void;
  removeAccepted: (key: string) => void;
};

export default function AcceptedAnswerEditor({
  accepted,
  addAccepted,
  updateAccepted,
  removeAccepted,
}: Props) {
  return (
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
  );
}
