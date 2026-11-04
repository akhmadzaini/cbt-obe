import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { api, apiDownload, clearToken } from "../lib/api";
import { errorMessage, formatBytes, formatDate } from "../lib/format";
import type {
  BackupRow,
  BackupScope,
  SystemEventRow,
  SystemJob,
  SystemStatus,
} from "../lib/types";

const RESET_CONFIRMATION = "RESET-SISTEM";

const ACTION_LABELS: Record<string, string> = {
  "backup.create": "Backup dibuat",
  "backup.download": "Backup diunduh",
  "backup.delete": "Backup dihapus",
  "restore.finish": "Restore dari server",
  "restore.upload": "Restore dari unggahan",
  "restore.fail": "Restore gagal",
  "reset.factory": "Factory reset",
  "reset.fail": "Factory reset gagal",
};

export default function SystemPanel() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [events, setEvents] = useState<SystemEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [includeUploads, setIncludeUploads] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [job, setJob] = useState<SystemJob | null>(null);

  const [restoreTarget, setRestoreTarget] = useState<BackupRow | null>(null);
  const [restoreScope, setRestoreScope] = useState<BackupScope>("full");
  const [restorePassword, setRestorePassword] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<BackupRow | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadScope, setUploadScope] = useState<BackupScope>("full");
  const [uploadPassword, setUploadPassword] = useState("");

  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetAck, setResetAck] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [statusResponse, backupsResponse, eventsResponse] = await Promise.all([
        api<SystemStatus>("/system/status"),
        api<{ backups: BackupRow[] }>("/system/backups"),
        api<{ events: SystemEventRow[] }>("/system/events"),
      ]);
      setStatus(statusResponse);
      setBackups(backupsResponse.backups);
      setEvents(eventsResponse.events);
      setError(null);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const jobId = job?.id;
  const jobStatus = job?.status;

  useEffect(() => {
    if (!jobId || jobStatus !== "running") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;

    const poll = async () => {
      if (cancelled) return;
      try {
        const response = await api<{ job: SystemJob }>(`/system/jobs/${jobId}`);
        if (cancelled) return;
        failures = 0;
        setJob(response.job);

        if (response.job.status === "done") {
          if (response.job.type === "restore") {
            setNotice(
              "Restore selesai. Backend akan restart dan Anda akan diarahkan ke halaman login.",
            );
            setTimeout(() => {
              clearToken();
              window.location.assign("/login");
            }, 2500);
          } else if (response.job.type === "reset") {
            setNotice("Factory reset selesai. Memuat ulang panel...");
            setTimeout(() => window.location.reload(), 2000);
          } else {
            setNotice("Backup berhasil dibuat.");
            void loadAll();
          }
          return;
        }

        if (response.job.status === "failed") {
          setError(response.job.error ?? "Proses gagal.");
          void loadAll();
          return;
        }
      } catch {
        // Backend mungkin sedang restart setelah restore; coba lagi.
        failures += 1;
        if (failures >= 120) {
          setError("Tidak dapat menghubungi server. Periksa status backend.");
          return;
        }
      }

      if (!cancelled) timer = setTimeout(poll, 1500);
    };

    timer = setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, jobStatus, loadAll]);

  useEffect(() => {
    const activeJobId = status?.activeJobId;
    if (!activeJobId || (job && job.id === activeJobId)) return;
    void api<{ job: SystemJob }>(`/system/jobs/${activeJobId}`)
      .then((response) => setJob(response.job))
      .catch(() => {});
  }, [status?.activeJobId, job]);

  const running = job?.status === "running" || Boolean(status?.activeJobId);
  const disabled = running || Boolean(busyAction);

  async function createBackup() {
    setBusyAction("create");
    setError(null);
    setNotice(null);
    try {
      const response = await api<{ job: SystemJob }>("/system/backups", {
        method: "POST",
        body: JSON.stringify({ includeUploads }),
      });
      setJob(response.job);
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setBusyAction(null);
    }
  }

  async function removeBackup() {
    if (!deleteTarget) return;
    setBusyAction("delete");
    setError(null);
    try {
      await api(`/system/backups/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setNotice("Backup dihapus.");
      await loadAll();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusyAction(null);
    }
  }

  async function submitRestore(event: FormEvent) {
    event.preventDefault();
    if (!restoreTarget) return;

    setBusyAction("restore");
    setError(null);
    setNotice(null);
    try {
      const response = await api<{ job: SystemJob }>(
        `/system/backups/${restoreTarget.id}/restore`,
        {
          method: "POST",
          body: JSON.stringify({
            scope: restoreScope,
            password: restorePassword,
          }),
        },
      );
      setRestoreTarget(null);
      setRestorePassword("");
      setJob(response.job);
      setNotice("Restore dimulai. Sistem akan masuk mode pemeliharaan.");
    } catch (restoreError) {
      setError(errorMessage(restoreError));
    } finally {
      setBusyAction(null);
    }
  }

  async function submitUploadRestore(event: FormEvent) {
    event.preventDefault();
    if (!uploadFile) {
      setError("Pilih file backup terlebih dahulu.");
      return;
    }

    setBusyAction("upload-restore");
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("scope", uploadScope);
      form.append("password", uploadPassword);

      const response = await api<{ job: SystemJob }>("/system/restore", {
        method: "POST",
        body: form,
      });
      setJob(response.job);
      setUploadFile(null);
      setUploadPassword("");
      setNotice("Restore dari file dimulai.");
    } catch (restoreError) {
      setError(errorMessage(restoreError));
    } finally {
      setBusyAction(null);
    }
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault();
    if (!resetAck) {
      setError("Centang pernyataan bahwa Anda memahami konsekuensi factory reset.");
      return;
    }

    setBusyAction("reset");
    setError(null);
    setNotice(null);
    try {
      const response = await api<{ job: SystemJob }>("/system/reset", {
        method: "POST",
        body: JSON.stringify({
          confirmation: resetConfirmation,
          password: resetPassword,
        }),
      });
      setJob(response.job);
      setResetConfirmation("");
      setResetPassword("");
      setResetAck(false);
      setNotice("Factory reset dimulai. Safety backup sedang dibuat.");
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setBusyAction(null);
    }
  }

  async function downloadBackup(backup: BackupRow) {
    setError(null);
    try {
      await apiDownload(`/system/backups/${backup.id}/download`, backup.name);
    } catch (downloadError) {
      setError(errorMessage(downloadError));
    }
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {job && (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Proses {job.type === "backup" ? "backup" : job.type === "restore" ? "restore" : "reset"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{job.step}</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                job.status === "done"
                  ? "bg-emerald-100 text-emerald-700"
                  : job.status === "failed"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-amber-100 text-amber-700"
              }`}
            >
              {job.status === "running"
                ? "Berjalan"
                : job.status === "done"
                  ? "Selesai"
                  : "Gagal"}
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all ${
                job.status === "failed" ? "bg-rose-500" : "bg-brand-500"
              }`}
              style={{ width: `${Math.max(2, job.progress)}%` }}
            />
          </div>
          {job.error && (
            <p className="mt-2 text-sm text-rose-700">{job.error}</p>
          )}
          {job.status === "done" && Boolean(job.result?.safetyBackup) && (
            <p className="mt-2 text-xs text-slate-500">
              Safety backup: {String(job.result?.safetyBackup)}
            </p>
          )}
        </section>
      )}

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

      <section className="card border border-rose-200">
        <h2 className="text-base font-bold text-rose-700">Factory Reset</h2>
        <p className="mt-1 text-sm text-slate-600">
          Menghapus <strong>seluruh data</strong>: ujian, bank soal, peserta,
          hasil, dan semua file upload. Hanya akun admin yang sedang login yang
          dipertahankan. Safety backup dibuat otomatis sebelum reset.
        </p>

        <form onSubmit={submitReset} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">
              Ketik <code>{RESET_CONFIRMATION}</code>
            </label>
            <input
              className="input"
              value={resetConfirmation}
              onChange={(event) => setResetConfirmation(event.target.value)}
              placeholder={RESET_CONFIRMATION}
              required
            />
          </div>
          <div>
            <label className="label">Password admin</label>
            <input
              type="password"
              className="input"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-600 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={resetAck}
              onChange={(event) => setResetAck(event.target.checked)}
            />
            Saya memahami bahwa seluruh data ujian, soal, peserta, dan file
            upload akan dihapus permanen.
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="btn bg-rose-600 text-white hover:bg-rose-700"
              disabled={
                disabled ||
                resetConfirmation !== RESET_CONFIRMATION ||
                !resetPassword ||
                !resetAck
              }
            >
              {busyAction === "reset" ? "Memproses..." : "Factory Reset"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="text-base font-bold text-slate-900">
          Riwayat Operasi Sistem
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          100 aktivitas terakhir. Riwayat ini tidak dihapus saat factory reset.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-2 pr-4">Waktu</th>
                <th className="py-2 pr-4">Aksi</th>
                <th className="py-2 pr-4">Admin</th>
                <th className="py-2 pr-4">IP</th>
                <th className="py-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.length === 0 && (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={5}>
                    Belum ada aktivitas.
                  </td>
                </tr>
              )}
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="py-2 pr-4 text-slate-600">
                    {formatDate(event.createdAt)}
                  </td>
                  <td className="py-2 pr-4 font-medium text-slate-800">
                    {ACTION_LABELS[event.action] ?? event.action}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {event.actorUsername}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {event.ipAddress ?? "—"}
                  </td>
                  <td className="py-2 text-xs text-slate-500">
                    {event.detail ? JSON.stringify(event.detail) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
    </div>
  );
}
