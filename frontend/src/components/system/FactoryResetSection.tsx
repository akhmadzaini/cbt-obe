import type { Dispatch, FormEvent, SetStateAction } from "react";

const RESET_CONFIRMATION = "RESET-SISTEM";

type Props = {
  submitReset: (event: FormEvent) => Promise<void>;
  resetConfirmation: string;
  setResetConfirmation: Dispatch<SetStateAction<string>>;
  resetPassword: string;
  setResetPassword: Dispatch<SetStateAction<string>>;
  resetAck: boolean;
  setResetAck: Dispatch<SetStateAction<boolean>>;
  disabled: boolean;
  busyAction: string | null;
};

export default function FactoryResetSection({
  submitReset,
  resetConfirmation,
  setResetConfirmation,
  resetPassword,
  setResetPassword,
  resetAck,
  setResetAck,
  disabled,
  busyAction,
}: Props) {
  return (
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
  );
}
