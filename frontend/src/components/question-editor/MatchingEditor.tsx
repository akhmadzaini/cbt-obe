import type { PairDraft } from "./drafts";

type Props = {
  pairs: PairDraft[];
  addPair: () => void;
  updatePair: (key: string, patch: Partial<PairDraft>) => void;
  removePair: (key: string) => void;
};

export default function MatchingEditor({
  pairs,
  addPair,
  updatePair,
  removePair,
}: Props) {
  return (
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
  );
}
