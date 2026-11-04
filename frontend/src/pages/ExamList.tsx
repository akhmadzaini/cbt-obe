import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate } from "../lib/format";
import type { ExamSummary } from "../lib/types";

export default function ExamListPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ exams: ExamSummary[] }>("/exams")
      .then((response) => setExams(response.exams))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Gagal memuat ujian."),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Computer Based Test
            </p>
            <h1 className="text-lg font-bold text-slate-900">
              Halo, {user?.fullName}
            </h1>
          </div>
          <button className="btn-secondary" onClick={logout}>
            Keluar
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900">Ujian Tersedia</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pilih ujian, lalu masuk ke mode layar penuh untuk memulai.
          </p>
        </div>

        {loading && (
          <div className="card text-sm text-slate-500">Memuat ujian...</div>
        )}

        {error && (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!loading && !error && exams.length === 0 && (
          <div className="card text-sm text-slate-500">
            Belum ada ujian yang dipublikasikan.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {exams.map((exam) => {
            const finished = exam.session?.status === "finished";
            const forced =
              finished && exam.session?.finishedReason === "force_submit";
            const inProgress =
              exam.session?.status === "in_progress" ||
              exam.session?.status === "started";

            return (
              <article key={exam.id} className="card flex flex-col gap-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-bold text-slate-900">
                      {exam.title}
                    </h3>
                    <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                      {exam.durationMinutes} menit
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {exam.subjectName ?? "Tanpa mapel"}
                  </p>
                  {exam.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                      {exam.description}
                    </p>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div>
                    <dt className="font-semibold text-slate-600">Mulai</dt>
                    <dd>{formatDate(exam.startAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600">Berakhir</dt>
                    <dd>{formatDate(exam.endAt)}</dd>
                  </div>
                </dl>

                <div className="mt-auto flex items-center justify-between gap-3">
                  {finished ? (
                    <div className="text-sm">
                      {forced ? (
                        <>
                          <span className="font-semibold text-rose-600">
                            Dikumpulkan paksa
                          </span>
                          <span className="block text-xs text-slate-500">
                            Hubungi admin untuk reset sesi.
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-emerald-700">
                            Selesai
                          </span>
                          <span className="ml-2 text-slate-500">
                            Nilai: {exam.session?.score ?? "-"}
                          </span>
                        </>
                      )}
                    </div>
                  ) : inProgress ? (
                    <span className="text-sm font-semibold text-amber-600">
                      Sedang berlangsung
                    </span>
                  ) : (
                    <span className="text-sm text-slate-400">
                      Belum dikerjakan
                    </span>
                  )}

                  <button
                    className="btn-primary"
                    disabled={finished}
                    onClick={() => navigate(`/exam/${exam.id}`)}
                  >
                    {finished
                      ? forced
                        ? "Menunggu Reset"
                        : "Sudah Selesai"
                      : inProgress
                        ? "Lanjutkan"
                        : "Mulai Ujian"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
