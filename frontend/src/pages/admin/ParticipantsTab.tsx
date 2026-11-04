import type { Dispatch, FormEvent, SetStateAction } from "react";
import { formatDateTime } from "../../lib/format";
import type { Participant, UserImportResult } from "../../lib/types";

type Props = {
  handleDownloadParticipantTemplate: () => Promise<void>;
  handleParticipantImport: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  participantImportMode: "skip" | "update";
  setParticipantImportMode: Dispatch<SetStateAction<"skip" | "update">>;
  participantImporting: boolean;
  participantImportResult: UserImportResult | null;
  filteredParticipants: Participant[];
  participants: Participant[];
  participantSearch: string;
  setParticipantSearch: Dispatch<SetStateAction<string>>;
  openCreateParticipant: () => void;
  openEditParticipant: (participant: Participant) => void;
  openDeleteParticipant: (participant: Participant) => Promise<void>;
};

export default function ParticipantsTab({
  handleDownloadParticipantTemplate,
  handleParticipantImport,
  participantImportMode,
  setParticipantImportMode,
  participantImporting,
  participantImportResult,
  filteredParticipants,
  participants,
  participantSearch,
  setParticipantSearch,
  openCreateParticipant,
  openEditParticipant,
  openDeleteParticipant,
}: Props) {
  return (
          <>
            <section className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Import Peserta (Excel)
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Unduh template, isi data peserta, lalu unggah kembali. Password
                    akan di-hash otomatis dan tidak pernah disimpan sebagai teks
                    biasa.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleDownloadParticipantTemplate()}
                >
                  Unduh Template Excel
                </button>
              </div>

              <form
                onSubmit={handleParticipantImport}
                className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px_auto]"
              >
                <div>
                  <label className="label">File Excel (.xlsx)</label>
                  <input
                    type="file"
                    name="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="input file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-700"
                    required
                  />
                </div>
                <div>
                  <label className="label">Jika username sudah ada</label>
                  <select
                    className="input"
                    value={participantImportMode}
                    onChange={(event) =>
                      setParticipantImportMode(
                        event.target.value === "update" ? "update" : "skip",
                      )
                    }
                  >
                    <option value="skip">Lewati (aman)</option>
                    <option value="update">Perbarui data peserta</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    className="btn-primary"
                    type="submit"
                    disabled={participantImporting}
                  >
                    {participantImporting ? "Mengimport..." : "Import Peserta"}
                  </button>
                </div>
              </form>

              {participantImportResult && (
                <div className="mt-4 rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Ringkasan import
                  </p>
                  <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-5">
                    <p>Total baris: {participantImportResult.totalRows}</p>
                    <p>Baru: {participantImportResult.imported}</p>
                    <p>Diperbarui: {participantImportResult.updated}</p>
                    <p>Dilewati: {participantImportResult.skipped}</p>
                    <p>Gagal: {participantImportResult.failed}</p>
                  </div>

                  {participantImportResult.errors.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                            <th className="py-2 pr-4">Baris</th>
                            <th className="py-2 pr-4">Username</th>
                            <th className="py-2">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {participantImportResult.errors.map((error, index) => (
                            <tr
                              key={`${error.row}-${index}`}
                              className="border-b border-slate-100 last:border-0"
                            >
                              <td className="py-2 pr-4">{error.row}</td>
                              <td className="py-2 pr-4 font-mono text-xs">
                                {error.username || "-"}
                              </td>
                              <td className="py-2 text-rose-700">
                                {error.message}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Daftar Peserta
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {filteredParticipants.length} dari {participants.length}{" "}
                    peserta ditampilkan.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="input max-w-xs"
                    value={participantSearch}
                    onChange={(event) =>
                      setParticipantSearch(event.target.value)
                    }
                    placeholder="Cari nama atau username"
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={openCreateParticipant}
                  >
                    Tambah Peserta
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-4">Username</th>
                      <th className="py-2 pr-4">Nama Lengkap</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Dibuat</th>
                      <th className="py-2 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParticipants.map((participant) => (
                      <tr
                        key={participant.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 pr-4 font-mono text-xs text-slate-600">
                          {participant.username}
                        </td>
                        <td className="py-2 pr-4 text-slate-800">
                          {participant.fullName}
                        </td>
                        <td className="py-2 pr-4">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              participant.isActive
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {participant.isActive ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-slate-500">
                          {formatDateTime(participant.createdAt)}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              onClick={() => openEditParticipant(participant)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                              onClick={() =>
                                void openDeleteParticipant(participant)
                              }
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredParticipants.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-4 text-center text-sm text-slate-500"
                        >
                          Tidak ada peserta yang cocok.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
  );
}
