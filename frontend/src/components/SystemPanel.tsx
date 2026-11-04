import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { api, apiDownload, clearToken } from "../lib/api";
import { errorMessage } from "../lib/format";
import JobProgress from "./system/JobProgress";
import StatusSection from "./system/StatusSection";
import BackupSection from "./system/BackupSection";
import RestoreUploadSection from "./system/RestoreUploadSection";
import FactoryResetSection from "./system/FactoryResetSection";
import EventLogSection from "./system/EventLogSection";
import SystemDialogs from "./system/SystemDialogs";
import type {
  BackupRow,
  BackupScope,
  SystemEventRow,
  SystemJob,
  SystemStatus,
} from "../lib/types";

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

      <JobProgress job={job} />

      <StatusSection status={status} loading={loading} loadAll={loadAll} />

      <BackupSection
        status={status}
        backups={backups}
        includeUploads={includeUploads}
        setIncludeUploads={setIncludeUploads}
        disabled={disabled}
        busyAction={busyAction}
        createBackup={createBackup}
        downloadBackup={downloadBackup}
        setRestoreTarget={setRestoreTarget}
        setRestoreScope={setRestoreScope}
        setRestorePassword={setRestorePassword}
        setDeleteTarget={setDeleteTarget}
        setError={setError}
      />

      <RestoreUploadSection
        status={status}
        submitUploadRestore={submitUploadRestore}
        setUploadFile={setUploadFile}
        uploadScope={uploadScope}
        setUploadScope={setUploadScope}
        uploadPassword={uploadPassword}
        setUploadPassword={setUploadPassword}
        uploadFile={uploadFile}
        disabled={disabled}
        busyAction={busyAction}
      />

      <FactoryResetSection
        submitReset={submitReset}
        resetConfirmation={resetConfirmation}
        setResetConfirmation={setResetConfirmation}
        resetPassword={resetPassword}
        setResetPassword={setResetPassword}
        resetAck={resetAck}
        setResetAck={setResetAck}
        disabled={disabled}
        busyAction={busyAction}
      />

      <EventLogSection events={events} />

      <SystemDialogs
        restoreTarget={restoreTarget}
        submitRestore={submitRestore}
        restoreScope={restoreScope}
        setRestoreScope={setRestoreScope}
        restorePassword={restorePassword}
        setRestorePassword={setRestorePassword}
        setRestoreTarget={setRestoreTarget}
        busyAction={busyAction}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        removeBackup={removeBackup}
      />
    </div>
  );
}
