import type { OverlayState } from "./types";

type Props = {
  overlay: OverlayState;
  submitting: boolean;
  onResume: () => void;
  onConfirmSubmit: () => void;
  onCancel: () => void;
  onReconnect: () => void;
};

export default function LockOverlay({
  overlay,
  submitting,
  onResume,
  onConfirmSubmit,
  onCancel,
  onReconnect,
}: Props) {
  const danger = overlay.kind === "forced";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div
          className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${
            danger ? "bg-rose-100" : "bg-amber-100"
          }`}
        >
          {danger ? "⛔" : overlay.kind === "confirm" ? "📝" : "⚠️"}
        </div>

        <h2 className="text-xl font-bold text-slate-900">{overlay.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{overlay.message}</p>

        {overlay.kind !== "confirm" && (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {overlay.kind === "violation" && overlay.syncError
              ? "Pelanggaran belum terkirim ke server: "
              : "Pelanggaran tercatat: "}
            <span className="font-bold text-slate-900">{overlay.strikes}</span>
          </p>
        )}

        {overlay.kind === "violation" && overlay.syncError && (
          <p className="mt-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Data pelanggaran belum tersimpan karena koneksi terputus. Sambungkan
            kembali internet, lalu tekan tombol di bawah untuk mengirim ulang
            sebelum melanjutkan ujian.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {overlay.kind === "violation" && (
            <button
              type="button"
              className="btn-primary"
              disabled={overlay.syncing}
              onClick={onResume}
            >
              {overlay.syncing
                ? "Menyinkronkan pelanggaran..."
                : overlay.syncError
                  ? "Coba Kirim Ulang & Lanjutkan"
                  : "Aktifkan Layar Penuh & Lanjutkan"}
            </button>
          )}

          {overlay.kind === "reconnect" && (
            <button type="button" className="btn-primary" onClick={onReconnect}>
              Sambung Ulang
            </button>
          )}

          {overlay.kind === "confirm" && (
            <>
              <button
                type="button"
                className="btn-primary"
                disabled={submitting}
                onClick={onConfirmSubmit}
              >
                {submitting ? "Mengumpulkan..." : "Ya, kumpulkan sekarang"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={onCancel}
              >
                Batal
              </button>
            </>
          )}

          {overlay.kind === "forced" && (
            <p className="text-center text-sm font-semibold text-rose-600">
              Mengalihkan ke halaman login...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
