import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { Participant, ParticipantInput } from "../../lib/types";

type TeacherEditorState = {
  mode: "create" | "edit";
  teacher: Participant | null;
  saving: boolean;
  error: string | null;
};

const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

type TeacherModalProps = {
  mode: "create" | "edit";
  teacher: Participant | null;
  saving: boolean;
  serverError: string | null;
  onClose: () => void;
  onSubmit: (input: ParticipantInput) => void | Promise<void>;
};

function TeacherModal({
  mode,
  teacher,
  saving,
  serverError,
  onClose,
  onSubmit,
}: TeacherModalProps) {
  const [username, setUsername] = useState(teacher?.username ?? "");
  const [fullName, setFullName] = useState(teacher?.fullName ?? "");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(teacher?.isActive ?? true);
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
      password: mode === "create" ? password : password || undefined,
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
              Manajemen Guru
            </p>
            <h2 className="text-xl font-bold text-slate-900">
              {mode === "create" ? "Tambah Akun Guru" : "Edit Akun Guru"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Guru hanya dapat mengelola ujian dan bank soal miliknya sendiri.
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
              placeholder="guru001"
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
              placeholder="Ibu Siti"
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
                ? "Simpan Guru"
                : "Simpan Perubahan"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function TeacherTab() {
  const [teachers, setTeachers] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<TeacherEditorState | null>(null);

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<{ users: Participant[] }>(
        "/users?role=teacher",
      );
      setTeachers(response.users);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memuat daftar guru.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeachers();
  }, [loadTeachers]);

  const filtered = teachers.filter((teacher) => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;
    return (
      teacher.username.toLowerCase().includes(keyword) ||
      teacher.fullName.toLowerCase().includes(keyword)
    );
  });

  function openCreate() {
    setError(null);
    setNotice(null);
    setEditor({
      mode: "create",
      teacher: null,
      saving: false,
      error: null,
    });
  }

  function openEdit(teacher: Participant) {
    setError(null);
    setNotice(null);
    setEditor({
      mode: "edit",
      teacher,
      saving: false,
      error: null,
    });
  }

  async function handleSave(input: ParticipantInput) {
    const current = editor;
    if (!current) return;

    setEditor((previous) =>
      previous ? { ...previous, saving: true, error: null } : previous,
    );

    try {
      if (current.mode === "create") {
        await api("/users", {
          method: "POST",
          body: JSON.stringify({ ...input, role: "teacher" }),
        });
        setNotice("Akun guru berhasil ditambahkan.");
      } else if (current.teacher) {
        await api(`/users/${current.teacher.id}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
        setNotice("Akun guru berhasil diperbarui.");
      } else {
        throw new Error("Akun guru tidak ditemukan.");
      }

      setEditor(null);
      await loadTeachers();
    } catch (err) {
      setEditor((previous) =>
        previous
          ? {
              ...previous,
              saving: false,
              error:
                err instanceof Error ? err.message : "Gagal menyimpan akun guru.",
            }
          : previous,
      );
    }
  }

  return (
    <>
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Akun Guru</h2>
            <p className="mt-1 text-sm text-slate-500">
              Guru dapat membuat bank soal, menyelenggarakan ujian, menilai
              essay, dan melihat hasil ujiannya sendiri.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={openCreate}>
            Tambah Guru
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Nama Lengkap</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Dibuat</th>
                <th className="py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((teacher) => (
                <tr
                  key={teacher.id}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="py-2 pr-4 font-mono text-xs text-slate-600">
                    {teacher.username}
                  </td>
                  <td className="py-2 pr-4 text-slate-800">
                    {teacher.fullName}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        teacher.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {teacher.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-500">
                    {formatDateTime(teacher.createdAt)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      onClick={() => openEdit(teacher)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-4 text-center text-sm text-slate-500"
                  >
                    Belum ada akun guru.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-4 text-center text-sm text-slate-500"
                  >
                    Memuat akun guru...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            Akun guru tidak dapat dihapus. Nonaktifkan lewat tombol Edit agar
            riwayat ujian tetap utuh.
          </p>
          <input
            className="input max-w-xs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama atau username"
          />
        </div>
      </section>

      {editor && (
        <TeacherModal
          key={editor.teacher?.id ?? "new-teacher"}
          mode={editor.mode}
          teacher={editor.teacher}
          saving={editor.saving}
          serverError={editor.error}
          onClose={() => setEditor(null)}
          onSubmit={handleSave}
        />
      )}
    </>
  );
}
