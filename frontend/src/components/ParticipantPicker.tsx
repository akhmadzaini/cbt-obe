import { useMemo, useState } from "react";
import type { ParticipantSummary } from "../lib/types";

type Props = {
  participants: ParticipantSummary[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  lockedIds?: Set<string>;
  emptyMessage?: string;
};

const EMPTY_LOCKED = new Set<string>();

export default function ParticipantPicker({
  participants,
  selectedIds,
  onChange,
  lockedIds = EMPTY_LOCKED,
  emptyMessage = "Belum ada peserta.",
}: Props) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!term) return participants;
    return participants.filter(
      (participant) =>
        participant.fullName.toLowerCase().includes(term) ||
        participant.username.toLowerCase().includes(term),
    );
  }, [participants, term]);

  const selectedSet = new Set(selectedIds);
  const selectedCount = participants.filter((participant) =>
    selectedSet.has(participant.id),
  ).length;

  function toggle(id: string) {
    if (lockedIds.has(id)) return;
    onChange(
      selectedSet.has(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    );
  }

  function selectAll() {
    onChange(participants.map((participant) => participant.id));
  }

  function clearAll() {
    onChange(selectedIds.filter((id) => lockedIds.has(id)));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
        <input
          className="input min-w-48 flex-1"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama atau username"
        />
        <button
          type="button"
          className="btn-secondary px-3 py-1.5 text-xs"
          onClick={selectAll}
          disabled={participants.length === 0}
        >
          Pilih semua
        </button>
        <button
          type="button"
          className="btn-secondary px-3 py-1.5 text-xs"
          onClick={clearAll}
          disabled={selectedIds.length === 0}
        >
          Kosongkan
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <p className="p-3 text-sm text-slate-500">{emptyMessage}</p>
        )}

        {filtered.map((participant) => {
          const locked = lockedIds.has(participant.id);
          const checked = selectedSet.has(participant.id);
          return (
            <label
              key={participant.id}
              className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${
                locked ? "cursor-not-allowed opacity-75" : "cursor-pointer hover:bg-slate-50"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={locked}
                onChange={() => toggle(participant.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-slate-800">
                  {participant.fullName}
                </span>
                <span className="ml-2 font-mono text-xs text-slate-500">
                  {participant.username}
                </span>
                {!participant.isActive && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                    Nonaktif
                  </span>
                )}
                {locked && (
                  <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    Sudah ada sesi
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
        {selectedCount} peserta dipilih
        {lockedIds.size > 0
          ? " · peserta dengan sesi tidak dapat dilepas"
          : ""}
      </p>
    </div>
  );
}
