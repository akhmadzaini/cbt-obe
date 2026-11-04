import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { BackupScope, SystemStatus } from "../../lib/types";

type Props = {
  status: SystemStatus | null;
  submitUploadRestore: (event: FormEvent) => Promise<void>;
  setUploadFile: Dispatch<SetStateAction<File | null>>;
  uploadScope: BackupScope;
  setUploadScope: Dispatch<SetStateAction<BackupScope>>;
  uploadPassword: string;
  setUploadPassword: Dispatch<SetStateAction<string>>;
  uploadFile: File | null;
  disabled: boolean;
  busyAction: string | null;
};

export default function RestoreUploadSection({
  status,
  submitUploadRestore,
  setUploadFile,
  uploadScope,
  setUploadScope,
  uploadPassword,
  setUploadPassword,
  uploadFile,
  disabled,
  busyAction,
}: Props) {
  return (
      <section className="card">
        <h2 className="text-base font-bold text-slate-900">
          Restore dari File
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Unggah arsip <code>.tar.gz</code> hasil backup. Sistem otomatis
          membuat safety backup sebelum memulihkan.
        </p>

        <form onSubmit={submitUploadRestore} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">File backup</label>
            <input
              type="file"
              accept=".tar.gz,.tgz,application/gzip"
              className="input"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
            />
            {status?.maxUploadMb && (
              <p className="mt-1 text-xs text-slate-500">
                Maksimal {status.maxUploadMb} MB.
              </p>
            )}
          </div>
          <div>
            <label className="label">Cakupan restore</label>
            <select
              className="input"
              value={uploadScope}
              onChange={(event) =>
                setUploadScope(event.target.value as BackupScope)
              }
            >
              <option value="full">Database + file upload</option>
              <option value="database">Database saja</option>
              <option value="uploads">File upload saja</option>
            </select>
          </div>
          <div>
            <label className="label">Password admin</label>
            <input
              type="password"
              className="input"
              value={uploadPassword}
              onChange={(event) => setUploadPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="btn-primary"
              disabled={disabled || !uploadFile}
            >
              {busyAction === "upload-restore"
                ? "Mengunggah..."
                : "Mulai Restore"}
            </button>
          </div>
        </form>
      </section>
  );
}
