import { randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { dbConfig, env } from "../env";
import { pool } from "../db";

export const BACKUP_FORMAT = 1;

export type BackupType = "manual" | "safety";
export type BackupScope = "full" | "database" | "uploads";

export type BackupManifest = {
  format: number;
  app: "cbt";
  createdAt: string;
  createdBy: string;
  type: BackupType;
  appVersion: string;
  serverVersion: string | null;
  migrations: string[];
  tables: Record<string, number>;
  uploads: { included: boolean; files: number; bytes: number };
  checksums: Record<string, string>;
};

export type BackupListItem = {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
  type: string;
  includeUploads: boolean;
  tables: Record<string, number>;
};

export type RestoreResult = {
  manifest: BackupManifest;
  scope: BackupScope;
  warnings: string[];
};

type StepReporter = (step: string, progress: number) => void;

const BACKUP_NAME_PATTERN = /^cbt-backup-[A-Za-z0-9-]+\.tar\.gz$/;

export function backupRoot(): string {
  return path.resolve(env.backupDir);
}

export function backupPath(name: string): string {
  if (
    !BACKUP_NAME_PATTERN.test(name) ||
    name.includes("..") ||
    name.includes("/") ||
    name.includes("\\")
  ) {
    throw new Error("Nama backup tidak valid.");
  }
  return path.join(backupRoot(), name);
}

export function resolveBackupPath(id: string): { name: string; filePath: string } {
  const name = id.endsWith(".tar.gz") ? id : `${id}.tar.gz`;
  return { name, filePath: backupPath(name) };
}

function stateDir(): string {
  return path.join(backupRoot(), ".state");
}

function tempDir(jobId: string): string {
  return path.join(backupRoot(), ".tmp", jobId);
}

function metaPath(name: string): string {
  return path.join(backupRoot(), `${name}.meta.json`);
}

function backupId(name: string): string {
  return name.replace(/\.tar\.gz$/, "");
}

function backupNameFromId(id: string): string {
  return id.endsWith(".tar.gz") ? id : `${id}.tar.gz`;
}

function timestampSuffix(date = new Date()): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
}

function trimOutput(value: string): string {
  const text = value.trim();
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

type ProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function runProcess(
  cmd: string[],
  options: {
    env?: Record<string, string | undefined>;
    stdin?: Blob;
  } = {},
): Promise<ProcessResult> {
  const proc = Bun.spawn({
    cmd,
    stdin: options.stdin ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...(options.env ?? {}) },
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

function mysqlArgs(): string[] {
  return [
    "--protocol=TCP",
    `--host=${dbConfig.host}`,
    `--port=${String(dbConfig.port)}`,
    `--user=${dbConfig.user}`,
    "--default-character-set=utf8mb4",
  ];
}

async function dumpDatabase(targetFile: string): Promise<void> {
  const baseArgs = [
    ...mysqlArgs(),
    "--single-transaction",
    "--quick",
    "--skip-lock-tables",
    "--hex-blob",
    "--add-drop-table",
    "--triggers",
    `--result-file=${targetFile}`,
    dbConfig.database,
  ];

  let result = await runProcess(
    ["mariadb-dump", ...baseArgs, "--routines", "--events"],
    {
      env: {
        MYSQL_PWD: dbConfig.password,
        MARIADB_PWD: dbConfig.password,
      },
    },
  );

  if (result.exitCode !== 0) {
    // User database bisa saja tidak memiliki privilege EVENT/TRIGGER.
    result = await runProcess(["mariadb-dump", ...baseArgs], {
      env: {
        MYSQL_PWD: dbConfig.password,
        MARIADB_PWD: dbConfig.password,
      },
    });
  }

  if (result.exitCode !== 0) {
    throw new Error(
      `Gagal membuat dump database: ${trimOutput(result.stderr) || "tanpa detail"}`,
    );
  }
}

async function restoreDatabase(dumpFile: string): Promise<void> {
  const result = await runProcess(
    ["mariadb", ...mysqlArgs(), `--database=${dbConfig.database}`],
    {
      env: {
        MYSQL_PWD: dbConfig.password,
        MARIADB_PWD: dbConfig.password,
      },
      stdin: Bun.file(dumpFile),
    },
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Gagal memulihkan database: ${trimOutput(result.stderr) || "tanpa detail"}`,
    );
  }
}

async function currentMigrations(): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM _migrations ORDER BY id",
  );
  return rows.map((row) => String(row.id));
}

async function serverVersion(): Promise<string | null> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT VERSION() AS version",
    );
    return rows[0]?.version ? String(rows[0].version) : null;
  } catch {
    return null;
  }
}

async function tableCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const [tables] = await pool.query<RowDataPacket[]>("SHOW TABLES");

  for (const row of tables) {
    const table = String(Object.values(row)[0] ?? "");
    if (!table || table === "_migrations" || !/^[A-Za-z0-9_]+$/.test(table)) {
      continue;
    }
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM \`${table}\``,
    );
    counts[table] = Number(countRows[0]?.total ?? 0);
  }

  return counts;
}

async function directoryStats(
  directory: string,
): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const stack: string[] = [directory];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(target);
      } else if (entry.isFile()) {
        files += 1;
        try {
          bytes += (await stat(target)).size;
        } catch {
          // File bisa hilang saat pemindaian berjalan; abaikan.
        }
      }
    }
  }

  return { files, bytes };
}

async function sha256File(filePath: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  const stream = Bun.file(filePath).stream();
  for await (const chunk of stream) {
    hasher.update(chunk);
  }
  return hasher.digest("hex");
}

async function emptyDirectory(directory: string): Promise<number> {
  let removed = 0;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    await rm(path.join(directory, entry.name), { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

function manifestFromUnknown(value: unknown): BackupManifest {
  const manifest = value as Partial<BackupManifest> | null;
  if (
    !manifest ||
    manifest.format !== BACKUP_FORMAT ||
    manifest.app !== "cbt" ||
    typeof manifest.createdAt !== "string" ||
    !Array.isArray(manifest.migrations) ||
    typeof manifest.tables !== "object" ||
    manifest.tables === null ||
    typeof manifest.checksums !== "object" ||
    manifest.checksums === null
  ) {
    throw new Error("Manifest backup tidak valid atau tidak didukung.");
  }

  return {
    format: BACKUP_FORMAT,
    app: "cbt",
    createdAt: manifest.createdAt,
    createdBy: String(manifest.createdBy ?? "unknown"),
    type: manifest.type === "safety" ? "safety" : "manual",
    appVersion: String(manifest.appVersion ?? "unknown"),
    serverVersion: manifest.serverVersion ? String(manifest.serverVersion) : null,
    migrations: manifest.migrations.map(String),
    tables: manifest.tables as Record<string, number>,
    uploads: {
      included: Boolean(manifest.uploads?.included),
      files: Number(manifest.uploads?.files ?? 0),
      bytes: Number(manifest.uploads?.bytes ?? 0),
    },
    checksums: manifest.checksums as Record<string, string>,
  };
}

export async function ensureBackupStorage(): Promise<void> {
  await mkdir(backupRoot(), { recursive: true });
  await mkdir(stateDir(), { recursive: true });
  await mkdir(path.join(backupRoot(), ".tmp"), { recursive: true });
}

export async function listBackups(): Promise<BackupListItem[]> {
  await ensureBackupStorage();
  const entries = await readdir(backupRoot(), { withFileTypes: true });
  const items: BackupListItem[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !BACKUP_NAME_PATTERN.test(entry.name)) continue;

    const filePath = path.join(backupRoot(), entry.name);
    const info = await stat(filePath);
    let manifest: BackupManifest | null = null;
    try {
      manifest = manifestFromUnknown(
        JSON.parse(await readFile(metaPath(entry.name), "utf8")),
      );
    } catch {
      manifest = null;
    }

    items.push({
      id: backupId(entry.name),
      name: entry.name,
      createdAt: manifest?.createdAt ?? info.mtime.toISOString(),
      sizeBytes: info.size,
      type: manifest?.type ?? "unknown",
      includeUploads: manifest?.uploads.included ?? false,
      tables: manifest?.tables ?? {},
    });
  }

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function backupSummary(): Promise<{
  count: number;
  bytes: number;
  diskFreeBytes: number | null;
}> {
  const items = await listBackups();
  let diskFreeBytes: number | null = null;

  // `statfs` belum tentu tersedia di semua runtime Bun; `df` cukup andal di
  // container Linux dan gagal secara aman di platform lain.
  try {
    const result = await runProcess(["df", "-Pk", backupRoot()]);
    if (result.exitCode === 0) {
      const lines = result.stdout.trim().split(/\r?\n/);
      const columns = (lines[1] ?? "").split(/\s+/);
      const availableKb = Number(columns[3]);
      if (Number.isFinite(availableKb)) {
        diskFreeBytes = availableKb * 1024;
      }
    }
  } catch {
    diskFreeBytes = null;
  }

  return {
    count: items.length,
    bytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
    diskFreeBytes,
  };
}

export async function createBackup(options: {
  type: BackupType;
  includeUploads: boolean;
  createdBy: string;
  onStep?: StepReporter;
}): Promise<{ name: string; manifest: BackupManifest; sizeBytes: number }> {
  if (!env.backupEnabled) {
    throw new Error("Fitur backup dinonaktifkan oleh administrator.");
  }

  await ensureBackupStorage();
  const jobId = randomUUID();
  const staging = tempDir(jobId);
  const archiveTemp = path.join(staging, "backup.tar.gz");
  const report = options.onStep ?? (() => {});

  try {
    await mkdir(staging, { recursive: true });

    report("Membaca struktur database", 10);
    const [migrations, version, tables] = await Promise.all([
      currentMigrations(),
      serverVersion(),
      tableCounts(),
    ]);

    report("Membuat dump database", 30);
    const dumpFile = path.join(staging, "database.sql");
    await dumpDatabase(dumpFile);

    let uploadStats = { files: 0, bytes: 0 };
    let includeUploads = options.includeUploads;

    if (includeUploads) {
      report("Menyalin file upload", 55);
      const uploadRoot = path.resolve(env.uploadDir);
      const uploadTarget = path.join(staging, "uploads");
      if (await pathExists(uploadRoot)) {
        await cp(uploadRoot, uploadTarget, { recursive: true });
        uploadStats = await directoryStats(uploadTarget);
      } else {
        // Folder upload belum ada (belum ada gambar).
        await mkdir(uploadTarget, { recursive: true });
        includeUploads = false;
      }
    }

    report("Menulis manifest", 70);
    const checksum = await sha256File(dumpFile);
    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      app: "cbt",
      createdAt: new Date().toISOString(),
      createdBy: options.createdBy,
      type: options.type,
      appVersion: "1.0.0",
      serverVersion: version,
      migrations,
      tables,
      uploads: { included: includeUploads, ...uploadStats },
      checksums: { "database.sql": checksum },
    };

    await writeFile(
      path.join(staging, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    report("Mengemas arsip", 85);
    const tarArgs = [
      "-czf",
      archiveTemp,
      "-C",
      staging,
      "manifest.json",
      "database.sql",
    ];
    if (includeUploads) tarArgs.push("uploads");

    const tarResult = await runProcess(["tar", ...tarArgs]);
    if (tarResult.exitCode !== 0) {
      throw new Error(
        `Gagal membuat arsip: ${trimOutput(tarResult.stderr) || "tanpa detail"}`,
      );
    }

    const baseName = `cbt-backup-${timestampSuffix()}-${options.type}`;
    let finalName = `${baseName}.tar.gz`;
    let counter = 1;
    while (await Bun.file(path.join(backupRoot(), finalName)).exists()) {
      finalName = `${baseName}-${counter}.tar.gz`;
      counter += 1;
    }

    await rename(archiveTemp, path.join(backupRoot(), finalName));
    await writeFile(metaPath(finalName), JSON.stringify(manifest, null, 2), "utf8");

    report("Menerapkan retensi backup", 95);
    await applyRetention();

    const info = await stat(path.join(backupRoot(), finalName));
    report("Selesai", 100);

    return { name: finalName, manifest, sizeBytes: info.size };
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

async function applyRetention(): Promise<void> {
  const limit = Math.max(1, env.backupRetentionCount);
  const items = await listBackups();
  for (const item of items.slice(limit)) {
    await deleteBackup(item.id).catch(() => {});
  }
}

export async function deleteBackup(id: string): Promise<void> {
  const name = backupNameFromId(id);
  const filePath = backupPath(name);
  await rm(filePath, { force: true });
  await rm(metaPath(name), { force: true });
}

async function extractArchive(archivePathToExtract: string, target: string) {
  const nameResult = await runProcess(["tar", "-tzf", archivePathToExtract]);
  if (nameResult.exitCode !== 0) {
    throw new Error(
      `Arsip tidak dapat dibaca: ${trimOutput(nameResult.stderr) || "format tidak dikenal"}`,
    );
  }

  const typeResult = await runProcess(["tar", "-tvzf", archivePathToExtract]);
  if (typeResult.exitCode !== 0) {
    throw new Error(
      `Arsip tidak dapat dibaca: ${trimOutput(typeResult.stderr) || "format tidak dikenal"}`,
    );
  }

  const names = nameResult.stdout.split(/\r?\n/).filter(Boolean);
  const typeLines = typeResult.stdout.split(/\r?\n/).filter(Boolean);

  if (names.length === 0) throw new Error("Arsip backup kosong.");
  if (names.length !== typeLines.length) {
    throw new Error("Struktur arsip backup tidak valid.");
  }

  for (let index = 0; index < names.length; index += 1) {
    const rawName = names[index] ?? "";
    const type = typeLines[index]?.[0];
    const normalized = rawName.replace(/^\.\//, "");

    if (type !== "-" && type !== "d") {
      throw new Error("Arsip backup berisi symlink/hardlink yang tidak diizinkan.");
    }
    if (
      normalized.startsWith("/") ||
      normalized.includes("..") ||
      normalized.includes("\\") ||
      normalized.includes("\0")
    ) {
      throw new Error("Arsip backup berisi path yang tidak aman.");
    }

    const topLevel = normalized.split("/")[0];
    if (topLevel && !["manifest.json", "database.sql", "uploads"].includes(topLevel)) {
      throw new Error(`Arsip backup berisi entri tak dikenal: ${topLevel}`);
    }
  }

  await mkdir(target, { recursive: true });
  const extract = await runProcess([
    "tar",
    "-xzf",
    archivePathToExtract,
    "-C",
    target,
    "--no-same-owner",
    "--no-overwrite-dir",
  ]);
  if (extract.exitCode !== 0) {
    throw new Error(
      `Gagal mengekstrak arsip: ${trimOutput(extract.stderr) || "tanpa detail"}`,
    );
  }
}

export async function restoreBackup(options: {
  archivePath: string;
  scope: BackupScope;
  onStep?: StepReporter;
}): Promise<RestoreResult> {
  await ensureBackupStorage();
  const jobId = randomUUID();
  const staging = tempDir(jobId);
  const report = options.onStep ?? (() => {});
  const warnings: string[] = [];

  try {
    report("Memeriksa arsip", 5);
    await mkdir(staging, { recursive: true });
    await extractArchive(options.archivePath, staging);

    report("Memvalidasi manifest", 15);
    const manifest = manifestFromUnknown(
      JSON.parse(await readFile(path.join(staging, "manifest.json"), "utf8")),
    );

    const dumpFile = path.join(staging, "database.sql");
    if (!(await Bun.file(dumpFile).exists())) {
      throw new Error("Arsip tidak berisi database.sql.");
    }

    const expectedChecksum = manifest.checksums["database.sql"];
    if (expectedChecksum) {
      const actual = await sha256File(dumpFile);
      if (actual !== expectedChecksum) {
        throw new Error("Checksum database.sql tidak cocok. Arsip rusak.");
      }
    }

    const current = await currentMigrations();
    const unknownMigrations = manifest.migrations.filter(
      (migration) => !current.includes(migration),
    );
    if (unknownMigrations.length > 0) {
      throw new Error(
        `Backup dibuat oleh versi aplikasi yang lebih baru (migrasi: ${unknownMigrations.join(", ")}). Perbarui aplikasi terlebih dahulu.`,
      );
    }

    if (
      options.scope !== "database" &&
      !manifest.uploads.included
    ) {
      warnings.push(
        "Arsip tidak berisi file upload; data upload yang ada tidak diubah.",
      );
    }

    if (options.scope === "full" || options.scope === "database") {
      report("Memulihkan database", 45);
      await restoreDatabase(dumpFile);
    }

    if (options.scope === "full" || options.scope === "uploads") {
      const extractedUploads = path.join(staging, "uploads");
      const hasUploads = await pathExists(extractedUploads);
      if (hasUploads) {
        report("Memulihkan file upload", 75);
        const uploadRoot = path.resolve(env.uploadDir);
        await mkdir(uploadRoot, { recursive: true });
        await emptyDirectory(uploadRoot);
        await cp(extractedUploads, uploadRoot, { recursive: true });
      } else if (manifest.uploads.included) {
        warnings.push("Folder upload tidak ditemukan di arsip.");
      }
    }

    report("Selesai", 100);
    return { manifest, scope: options.scope, warnings };
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export async function uploadsStats(): Promise<{ files: number; bytes: number }> {
  return directoryStats(path.resolve(env.uploadDir));
}

export async function clearUploads(): Promise<number> {
  return emptyDirectory(path.resolve(env.uploadDir));
}
