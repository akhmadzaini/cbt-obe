import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

type Props = {
  className?: string;
  label?: string;
};

/**
 * Tombol + dialog ubah password mandiri. Dipakai di header siswa maupun
 * panel admin/guru. Password lama wajib diverifikasi server.
 */
export default function ChangePasswordButton({
  className = "btn-secondary",
  label = "Ubah Password",
}: Props) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSaving(false);
    setError(null);
    setSuccess(false);
  }

  function openDialog() {
    reset();
    setOpen(true);
  }

  function closeDialog() {
    if (saving) return;
    setOpen(false);
    reset();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError("Password saat ini wajib diisi.");
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      setError("Password baru harus 8-128 karakter.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Password baru harus berbeda dari password saat ini.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password baru tidak cocok.");
      return;
    }

    setSaving(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal mengubah password.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={openDialog}>
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
          <form
            onSubmit={handleSubmit}
            role="dialog"
            aria-modal="true"
            aria-label="Ubah password"
            className="my-6 w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                  Keamanan Akun
                </p>
                <h2 className="text-xl font-bold text-slate-900">
                  Ubah Password
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Masukkan password saat ini untuk memastikan perubahan
                  dilakukan oleh pemilik akun.
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeDialog}
                disabled={saving}
              >
                Tutup
              </button>
            </div>

            {success ? (
              <div className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Password berhasil diubah. Gunakan password baru pada login
                berikutnya.
              </div>
            ) : (
              <>
                <fieldset disabled={saving} className="mt-5 space-y-4">
                  <div>
                    <label className="label" htmlFor="current-password">
                      Password saat ini
                    </label>
                    <input
                      id="current-password"
                      type="password"
                      className="input"
                      value={currentPassword}
                      onChange={(event) =>
                        setCurrentPassword(event.target.value)
                      }
                      autoComplete="current-password"
                      required
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="new-password">
                      Password baru
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      className="input"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                      placeholder="Minimal 8 karakter"
                      required
                    />
                  </div>

                  <div>
                    <label className="label" htmlFor="confirm-password">
                      Ulangi password baru
                    </label>
                    <input
                      id="confirm-password"
                      type="password"
                      className="input"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      autoComplete="new-password"
                      placeholder="Ketik ulang password baru"
                      required
                    />
                  </div>
                </fieldset>

                {error && (
                  <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}
              </>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeDialog}
                disabled={saving}
              >
                {success ? "Selesai" : "Batal"}
              </button>
              {!success && (
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Menyimpan..." : "Simpan Password"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
