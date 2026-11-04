import type { SessionPayload } from "../../lib/types";

type Props = {
  payload: SessionPayload;
  onBack: () => void;
};

export default function FinishedScreen({ payload, onBack }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-xl">
        <h1 className="text-xl font-bold text-slate-900">
          {payload.session.status === "finished"
            ? "Ujian Selesai"
            : "Ujian Tidak Aktif"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {payload.session.finishedReason === "force_submit"
            ? "Sesi dihentikan karena melebihi batas pelanggaran. Hubungi admin/pengawas untuk mereset sesi agar Anda dapat melanjutkan ujian."
            : "Sesi ujian ini sudah tidak aktif."}
        </p>
        <button type="button" className="btn-primary mt-6" onClick={onBack}>
          Kembali ke Daftar Ujian
        </button>
      </div>
    </div>
  );
}
