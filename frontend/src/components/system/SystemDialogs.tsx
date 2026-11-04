import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { BackupRow, BackupScope } from "../../lib/types";

type Props = {
  restoreTarget: BackupRow | null;
  submitRestore: (event: FormEvent) => Promise<void>;
  restoreScope: BackupScope;
  setRestoreScope: Dispatch<SetStateAction<BackupScope>>;
  restorePassword: string;
  setRestorePassword: Dispatch<SetStateAction<string>>;
  setRestoreTarget: Dispatch<SetStateAction<BackupRow | null>>;
  busyAction: string | null;
  deleteTarget: BackupRow | null;
  setDeleteTarget: Dispatch<SetStateAction<BackupRow | null>>;
  removeBackup: () => Promise<void>;
};

export default function SystemDialogs({
  restoreTarget,
  submitRestore,
  restoreScope,
  setRestoreScope,
  restorePassword,
  setRestorePassword,
  setRestoreTarget,
  busyAction,
  deleteTarget,
  setDeleteTarget,
  removeBackup,
}: Props) {
  return (
    <>
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
          <form
            onSubmit={submitRestore}
            className="my-10 w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <h2 className="text-lg font-bold text-slate-900">Restore Backup</h2>
            <p className="mt-1 text-sm text-slate-600">
              {restoreTarget.name}
            </p>
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Data saat ini akan ditimpa. Safety backup otomatis dibuat sebelum
              restore dijalankan.
            </p>

            <div className="mt-4">
              <label className="label">Cakupan restore</label>
              <select
                className="input"
                value={restoreScope}
                onChange={(event) =>
                  setRestoreScope(event.target.value as BackupScope)
                }
              >
                <option value="full">Database + file upload</option>
                <option value="database">Database saja</option>
                <option value="uploads">File upload saja</option>
              </select>
            </div>

            <div className="mt-3">
              <label className="label">Password admin</label>
              <input
                type="password"
                className="input"
                value={restorePassword}
                onChange={(event) => setRestorePassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRestoreTarget(null)}
              >
                Batal
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={Boolean(busyAction)}
              >
                {busyAction === "restore" ? "Memproses..." : "Restore Sekarang"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
          <div className="my-16 w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <h2 className="text-lg font-bold text-slate-900">Hapus Backup?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Arsip <strong>{deleteTarget.name}</strong> akan dihapus dari
              server. Pastikan Anda sudah menyimpan salinannya.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn bg-rose-600 text-white hover:bg-rose-700"
                disabled={busyAction === "delete"}
                onClick={() => void removeBackup()}
              >
                {busyAction === "delete" ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
