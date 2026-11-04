import type { SystemJob } from "../../lib/types";

export default function JobProgress({ job }: { job: SystemJob | null }) {
  if (!job) return null;

  return (
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
  );
}
