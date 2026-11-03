import { useState, type FormEvent } from "react";
import type { Participant, ParticipantInput } from "../lib/types";

type Props = {
  mode: "create" | "edit";
  participant: Participant | null;
  saving: boolean;
  serverError: string | null;
  onClose: () => void;
  onSubmit: (input: ParticipantInput) => void | Promise<void>;
};

const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export default function ParticipantEditorModal({
  mode,
  participant,
  saving,
  serverError,
  onClose,
  onSubmit,
}: Props) {
  const [username, setUsername] = useState(participant?.username ?? "");
  const [fullName, setFullName] = useState(participant?.fullName ?? "");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(participant?.isActive ?? true);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);

    const nextUsername = username.trim();
    const nextFullName = fullName.trim();

    if (nextUsername.length < 3 || nextUsername.length > 100) {
      setLocalError("Username harus 3-100 karakter.");
      return;
    }
    if (!USERNAME_PATTERN.test(nextUsername)) {
      setLocalError(
        "Username hanya boleh berisi huruf, angka, titik, underscore, atau tanda hubung.",
      );
      return;
    }
    if (!nextFullName) {
      setLocalError("Nama lengkap wajib diisi.");
      return;
    }
    if (nextFullName.length > 150) {
      setLocalError("Nama lengkap maksimal 150 karakter.");
      return;
    }
    if (mode === "create" && !password) {
      setLocalError("Password wajib diisi.");
      return;
    }
    if (password.length > 0 && (password.length < 8 || password.length > 128)) {
      setLocalError("Password harus 8-128 karakter.");
      return;
    }

    void onSubmit({
      username: nextUsername,
      fullName: nextFullName,
      isActive,
      password: password.length > 0 ? password : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4">
      <form
        onSubmit={handleSubmit}
        className="my-6 w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Manajemen Peserta
            </p>
            <h2 className="text-xl font-bold text-slate-900">
              {mode === "create" ? "Tambah Peserta" : "Edit Peserta"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Akun peserta dibuat dengan role student.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Tutup
          </button>
        </div>

        <fieldset disabled={saving} className="mt-5 space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              placeholder="siswa001"
              required
            />
            <p className="mt-1 text-xs text-slate-400">
              3-100 karakter. Huruf, angka, titik, underscore, atau tanda hubung.
            </p>
          </div>

          <div>
            <label className="label">Nama lengkap</label>
            <input
              className="input"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="off"
              placeholder="Budi Santoso"
              maxLength={150}
              required
            />
          </div>

          <div>
            <label className="label">
              Password {mode === "edit" ? "(opsional)" : ""}
            </label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              placeholder={
                mode === "edit"
                  ? "Kosongkan jika tidak ingin mengganti password"
                  : "Minimal 8 karakter"
              }
              required={mode === "create"}
            />
            {mode === "edit" && (
              <p className="mt-1 text-xs text-slate-400">
                Kosongkan jika password tidak diubah.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Akun aktif (dapat login)
          </label>
        </fieldset>

        {localError && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {localError}
          </div>
        )}
        {serverError && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {serverError}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving
              ? "Menyimpan..."
              : mode === "create"
                ? "Simpan Peserta"
                : "Simpan Perubahan"}
          </button>
        </div>
      </form>
    </div>
  );
}
