import { clampPercent, type OptionDraft } from "./drafts";

type Props = {
  options: OptionDraft[];
  addOption: () => void;
  updateOption: (key: string, patch: Partial<OptionDraft>) => void;
  removeOption: (key: string) => void;
};

export default function OptionListEditor({
  options,
  addOption,
  updateOption,
  removeOption,
}: Props) {
  return (
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
  );
}
