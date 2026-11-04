import { formatBytes } from "../../lib/format";
import type { SystemStatus } from "../../lib/types";

type Props = {
  status: SystemStatus | null;
  loading: boolean;
  loadAll: () => Promise<void>;
};

export default function StatusSection({ status, loading, loadAll }: Props) {
  return (
      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Status Sistem</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ringkasan penyimpanan dan data yang sedang aktif.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void loadAll()}
            disabled={loading}
          >
            {loading ? "Memuat..." : "Muat ulang"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Database
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {formatBytes(status?.databaseBytes)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              File upload
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {formatBytes(status?.uploadsBytes)}
            </p>
            <p className="text-xs text-slate-500">
              {status?.uploadsFiles ?? 0} file
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Backup tersimpan
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {status?.backupCount ?? 0}
            </p>
            <p className="text-xs text-slate-500">
              {formatBytes(status?.backupBytes)} · retensi{" "}
              {status?.backupRetentionCount ?? 10}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sesi ujian aktif
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {status?.activeSessions ?? 0}
            </p>
            <p className="text-xs text-slate-500">
              Sisa disk {formatBytes(status?.diskFreeBytes)}
            </p>
          </div>
        </div>
      </section>
  );
}
