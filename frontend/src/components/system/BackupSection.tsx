import type { Dispatch, SetStateAction } from "react";
import { formatBytes, formatDate } from "../../lib/format";
import type { BackupRow, BackupScope, SystemStatus } from "../../lib/types";

type Props = {
  status: SystemStatus | null;
  backups: BackupRow[];
  includeUploads: boolean;
  setIncludeUploads: Dispatch<SetStateAction<boolean>>;
  disabled: boolean;
  busyAction: string | null;
  createBackup: () => Promise<void>;
  downloadBackup: (backup: BackupRow) => Promise<void>;
  setRestoreTarget: Dispatch<SetStateAction<BackupRow | null>>;
  setRestoreScope: Dispatch<SetStateAction<BackupScope>>;
  setRestorePassword: Dispatch<SetStateAction<string>>;
  setDeleteTarget: Dispatch<SetStateAction<BackupRow | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

export default function BackupSection({
  status,
  backups,
  includeUploads,
  setIncludeUploads,
  disabled,
  busyAction,
  createBackup,
  downloadBackup,
  setRestoreTarget,
  setRestoreScope,
  setRestorePassword,
  setDeleteTarget,
  setError,
}: Props) {
  return (
      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Backup</h2>
            <p className="mt-1 text-sm text-slate-500">
              Membuat arsip database dan file upload di server. Unduh arsip dan
              simpan di lokasi lain sebagai cadangan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={includeUploads}
                onChange={(event) => setIncludeUploads(event.target.checked)}
              />
              Sertakan file upload
            </label>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void createBackup()}
              disabled={disabled || status?.backupEnabled === false}
            >
              {busyAction === "create" ? "Menyiapkan..." : "Buat Backup"}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-2 pr-4">Nama</th>
                <th className="py-2 pr-4">Dibuat</th>
                <th className="py-2 pr-4">Tipe</th>
                <th className="py-2 pr-4">Ukuran</th>
                <th className="py-2 pr-4">Upload</th>
                <th className="py-2">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {backups.length === 0 && (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={6}>
                    Belum ada backup.
                  </td>
                </tr>
              )}
              {backups.map((backup) => (
                <tr key={backup.id}>
                  <td className="py-2 pr-4 font-medium text-slate-800">
                    {backup.name}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {formatDate(backup.createdAt)}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        backup.type === "safety"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {backup.type === "safety" ? "safety" : "manual"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {formatBytes(backup.sizeBytes)}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {backup.includeUploads ? "Ya" : "Tidak"}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-brand-700 underline"
                        onClick={() => void downloadBackup(backup)}
                      >
                        Unduh
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-amber-700 underline"
                        disabled={disabled}
                        onClick={() => {
                          setRestoreTarget(backup);
                          setRestoreScope("full");
                          setRestorePassword("");
                          setError(null);
                        }}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-700 underline"
                        disabled={disabled}
                        onClick={() => setDeleteTarget(backup)}
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
  );
}
