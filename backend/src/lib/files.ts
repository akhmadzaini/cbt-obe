import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/**
 * Menyimpan file ke local storage (bind mount). Tidak ada cloud storage.
 * Mengembalikan URL relatif yang diserve backend: /uploads/...
 */
export async function saveUploadedFile(
  file: File,
  subdirectory: string,
): Promise<string> {
  const extension = path.extname(file.name || "").toLowerCase() || ".png";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Format file tidak didukung. Gunakan png, jpg, jpeg, atau webp.");
  }

  const safeSubdirectory = subdirectory.replace(/[^a-zA-Z0-9/_-]/g, "");
  const relativePath = `${safeSubdirectory}/${randomUUID()}${extension}`;
  const absolutePath = path.join(env.uploadDir, relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await Bun.write(absolutePath, file);

  return `/uploads/${relativePath}`;
}

/**
 * Menghapus seluruh gambar milik satu soal (gambar soal + gambar opsi).
 * Hanya folder questions/<questionId> yang disentuh; kegagalan diabaikan.
 */
export async function removeQuestionUploads(
  questionId: string,
): Promise<void> {
  if (!/^[A-Za-z0-9-]+$/.test(questionId)) return;

  const questionsRoot = path.resolve(env.uploadDir, "questions");
  const directory = path.resolve(questionsRoot, questionId);
  if (
    directory !== questionsRoot &&
    !directory.startsWith(`${questionsRoot}${path.sep}`)
  ) {
    return;
  }

  try {
    await rm(directory, { recursive: true, force: true });
  } catch {
    // Pembersihan file bersifat best-effort; data utama sudah terhapus.
  }
}

/**
 * Menghapus seluruh screenshot pelanggaran milik satu sesi.
 * Hanya folder violations/<sessionId> yang disentuh; kegagalan diabaikan.
 */
export async function removeSessionUploads(
  sessionId: string,
): Promise<void> {
  if (!/^[A-Za-z0-9-]+$/.test(sessionId)) return;

  const violationsRoot = path.resolve(env.uploadDir, "violations");
  const directory = path.resolve(violationsRoot, sessionId);
  if (
    directory !== violationsRoot &&
    !directory.startsWith(`${violationsRoot}${path.sep}`)
  ) {
    return;
  }

  try {
    await rm(directory, { recursive: true, force: true });
  } catch {
    // Pembersihan file bersifat best-effort; data utama sudah terhapus.
  }
}
