import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";

export type SystemJobType = "backup" | "restore" | "reset";
export type SystemJobStatus = "running" | "done" | "failed";

export type SystemJob = {
  id: string;
  type: SystemJobType;
  status: SystemJobStatus;
  step: string;
  progress: number;
  error: string | null;
  result: Record<string, unknown> | null;
  startedAt: string;
  finishedAt: string | null;
};

export type JobReporter = {
  onStep: (step: string, progress: number) => void;
};

const jobs = new Map<string, SystemJob>();
const MAX_JOBS_IN_MEMORY = 50;
let activeJobId: string | null = null;

export class SystemJobBusyError extends Error {
  readonly jobId: string;

  constructor(jobId: string) {
    super("Masih ada proses sistem yang berjalan. Tunggu sampai selesai.");
    this.name = "SystemJobBusyError";
    this.jobId = jobId;
  }
}

function stateDir(): string {
  return path.join(path.resolve(env.backupDir), ".state");
}

function jobFile(id: string): string {
  return path.join(stateDir(), `${id}.json`);
}

function isJobId(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

async function persist(job: SystemJob): Promise<void> {
  await mkdir(stateDir(), { recursive: true });
  await writeFile(jobFile(job.id), JSON.stringify(job, null, 2), "utf8");
}

function pruneMemory(): void {
  if (jobs.size <= MAX_JOBS_IN_MEMORY) return;

  const finished = [...jobs.values()]
    .filter((job) => job.status !== "running")
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  while (jobs.size > MAX_JOBS_IN_MEMORY && finished.length > 0) {
    const oldest = finished.shift();
    if (oldest) jobs.delete(oldest.id);
  }
}

export function getActiveJobId(): string | null {
  return activeJobId;
}

export async function startSystemJob(
  type: SystemJobType,
  runner: (reporter: JobReporter) => Promise<Record<string, unknown> | void>,
): Promise<SystemJob> {
  if (activeJobId) throw new SystemJobBusyError(activeJobId);

  const job: SystemJob = {
    id: randomUUID(),
    type,
    status: "running",
    step: "Mengantre",
    progress: 1,
    error: null,
    result: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };

  jobs.set(job.id, job);
  activeJobId = job.id;
  await persist(job);

  let writeChain: Promise<void> = Promise.resolve();
  const queuePersist = () => {
    writeChain = writeChain.then(() => persist(job)).catch(() => {});
  };

  void (async () => {
    const reporter: JobReporter = {
      onStep: (step, progress) => {
        job.step = step;
        job.progress = Math.max(1, Math.min(99, Math.round(progress)));
        queuePersist();
      },
    };

    try {
      const result = await runner(reporter);
      job.status = "done";
      job.step = "Selesai";
      job.progress = 100;
      job.result = (result as Record<string, unknown> | undefined) ?? null;
    } catch (error) {
      job.status = "failed";
      job.step = "Gagal";
      job.error = error instanceof Error ? error.message : String(error);
    } finally {
      job.finishedAt = new Date().toISOString();
      await writeChain.catch(() => {});
      await persist(job).catch(() => {});
      activeJobId = null;
      pruneMemory();
    }
  })();

  return job;
}

export async function getSystemJob(id: string): Promise<SystemJob | null> {
  if (!isJobId(id)) return null;

  const inMemory = jobs.get(id);
  if (inMemory) return inMemory;

  try {
    const raw = await readFile(jobFile(id), "utf8");
    const parsed = JSON.parse(raw) as SystemJob;
    if (parsed.id !== id) return null;
    jobs.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Dipanggil saat boot: proses yang masih "running" berarti backend berhenti di
 * tengah operasi. Tandai gagal agar UI tidak menunggu selamanya.
 */
export async function recoverInterruptedJobs(): Promise<void> {
  try {
    const entries = await readdir(stateDir(), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const file = path.join(stateDir(), entry.name);
      try {
        const job = JSON.parse(await readFile(file, "utf8")) as SystemJob;
        if (job.status !== "running") continue;
        job.status = "failed";
        job.step = "Terhenti";
        job.error = "Proses terhenti karena backend restart. Silakan ulangi.";
        job.finishedAt = new Date().toISOString();
        await persist(job);
      } catch {
        // Abaikan state rusak.
      }
    }
  } catch {
    // Folder state belum ada.
  }
}
