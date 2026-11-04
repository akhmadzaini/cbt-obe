import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Elysia, t } from "elysia";
import { desc, eq } from "drizzle-orm";
import type { RowDataPacket } from "mysql2";
import { db, pool } from "../db";
import { systemEvents, users } from "../db/schema";
import { env } from "../env";
import { getClientIp } from "../lib/auth";
import { authPlugin } from "../lib/auth-plugin";
import { logSystemEvent } from "../lib/audit";
import {
  backupRoot,
  backupSummary,
  createBackup,
  deleteBackup,
  listBackups,
  resolveBackupPath,
  restoreBackup,
  uploadsStats,
  type BackupScope,
} from "../lib/backup";
import {
  enterMaintenance,
  exitMaintenance,
  isMaintenance,
  maintenanceMessage,
} from "../lib/maintenance";
import { RATE_LIMITS } from "../lib/rate-limit";
import {
  getActiveJobId,
  getSystemJob,
  startSystemJob,
  SystemJobBusyError,
} from "../lib/system-jobs";
import { factoryReset } from "../lib/system-reset";

const RESET_CONFIRMATION = "RESET-SISTEM";

type AdminRecord = {
  id: string;
  username: string;
  fullName: string;
  passwordHash: string;
};

async function loadAdmin(userId: string): Promise<AdminRecord | null> {
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

async function verifyPassword(
  adminId: string,
  password: string,
): Promise<boolean> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, adminId))
    .limit(1);
  if (!row) return false;
  return Bun.password.verify(password, row.passwordHash);
}

function databaseBytes(): Promise<number> {
  return pool
    .query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes
         FROM information_schema.tables
        WHERE table_schema = DATABASE()`,
    )
    .then(([rows]) => Number(rows[0]?.bytes ?? 0));
}

function activeSessionCount(): Promise<number> {
  return pool
    .query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM exam_sessions
        WHERE status IN ('started', 'in_progress', 'suspended')`,
    )
    .then(([rows]) => Number(rows[0]?.total ?? 0));
}

function busyResponse(error: unknown) {
  if (error instanceof SystemJobBusyError) {
    return {
      error: error.message,
      jobId: error.jobId,
    };
  }
  throw error;
}

export const systemRoutes = new Elysia({ prefix: "/api/system" })
  .use(authPlugin)
  .get(
    "/status",
    async () => {
      const [dbBytes, uploads, backups, activeSessions] = await Promise.all([
        databaseBytes(),
        uploadsStats(),
        backupSummary(),
        activeSessionCount(),
      ]);

      return {
        backupEnabled: env.backupEnabled,
        maintenance: isMaintenance(),
        maintenanceMessage: isMaintenance() ? maintenanceMessage() : null,
        activeJobId: getActiveJobId(),
        databaseBytes: dbBytes,
        uploadsBytes: uploads.bytes,
        uploadsFiles: uploads.files,
        backupCount: backups.count,
        backupBytes: backups.bytes,
        diskFreeBytes: backups.diskFreeBytes,
        activeSessions,
        backupRetentionCount: env.backupRetentionCount,
        maxUploadMb: env.backupMaxUploadMb,
      };
    },
    {
      auth: {
        roles: ["admin"],
        rateLimit: { name: "system-status", ...RATE_LIMITS.systemStatus },
      },
    },
  )
  .get(
    "/backups",
    async () => {
      return { backups: await listBackups(), activeJobId: getActiveJobId() };
    },
    {
      auth: {
        roles: ["admin"],
        rateLimit: { name: "system-status", ...RATE_LIMITS.systemStatus },
      },
    },
  )
  .post(
    "/backups",
    async ({ body, user, request, server, status }) => {
      const admin = await loadAdmin(user.sub);
      if (!admin) return status(401, { error: "Unauthorized" });

      const ip = getClientIp(request, server);
      const includeUploads = body?.includeUploads ?? true;

      try {
        const job = await startSystemJob("backup", async (reporter) => {
          const result = await createBackup({
            type: "manual",
            includeUploads,
            createdBy: admin.username,
            onStep: reporter.onStep,
          });
          await logSystemEvent({
            actorId: admin.id,
            actorUsername: admin.username,
            action: "backup.create",
            detail: {
              name: result.name,
              sizeBytes: result.sizeBytes,
              includeUploads: result.manifest.uploads.included,
            },
            ip,
          });
          return {
            name: result.name,
            sizeBytes: result.sizeBytes,
            manifest: result.manifest,
          };
        });
        return status(202, { job });
      } catch (error) {
        return status(409, busyResponse(error));
      }
    },
    {
      auth: {
        roles: ["admin"],
        rateLimit: { name: "system-backup", ...RATE_LIMITS.systemBackup },
      },
      body: t.Object({
        includeUploads: t.Optional(t.Boolean()),
      }),
    },
  )
  .get(
    "/backups/:id/download",
    async ({ params, user, request, server, status }) => {
      let resolved: { name: string; filePath: string };
      try {
        resolved = resolveBackupPath(params.id);
      } catch {
        return status(400, { error: "Nama backup tidak valid." });
      }

      if (!(await Bun.file(resolved.filePath).exists())) {
        return status(404, { error: "Backup tidak ditemukan." });
      }

      const admin = await loadAdmin(user.sub);
      await logSystemEvent({
        actorId: admin?.id ?? user.sub,
        actorUsername: admin?.username ?? "admin",
        action: "backup.download",
        detail: { name: resolved.name },
        ip: getClientIp(request, server),
      });

      return new Response(Bun.file(resolved.filePath), {
        headers: {
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="${resolved.name}"`,
          "Cache-Control": "no-store",
        },
      });
    },
    {
      auth: {
        roles: ["admin"],
        rateLimit: { name: "system-download", ...RATE_LIMITS.systemDownload },
      },
    },
  )
  .delete(
    "/backups/:id",
    async ({ params, user, request, server, status }) => {
      let resolved: { name: string; filePath: string };
      try {
        resolved = resolveBackupPath(params.id);
      } catch {
        return status(400, { error: "Nama backup tidak valid." });
      }

      if (!(await Bun.file(resolved.filePath).exists())) {
        return status(404, { error: "Backup tidak ditemukan." });
      }

      const admin = await loadAdmin(user.sub);
      await deleteBackup(params.id);
      await logSystemEvent({
        actorId: admin?.id ?? user.sub,
        actorUsername: admin?.username ?? "admin",
        action: "backup.delete",
        detail: { name: resolved.name },
        ip: getClientIp(request, server),
      });

      return { ok: true };
    },
    {
      auth: {
        roles: ["admin"],
        rateLimit: { name: "system-download", ...RATE_LIMITS.systemDownload },
      },
    },
  )
  .post(
    "/backups/:id/restore",
    async ({ params, body, user, request, server, status }) => {
      const admin = await loadAdmin(user.sub);
      if (!admin) return status(401, { error: "Unauthorized" });
      if (!(await verifyPassword(admin.id, body.password))) {
        return status(403, { error: "Password salah." });
      }

      let resolved: { name: string; filePath: string };
      try {
        resolved = resolveBackupPath(params.id);
      } catch {
        return status(400, { error: "Nama backup tidak valid." });
      }
      if (!(await Bun.file(resolved.filePath).exists())) {
        return status(404, { error: "Backup tidak ditemukan." });
      }

      const ip = getClientIp(request, server);
      const scope = body.scope as BackupScope;

      try {
        const job = await startSystemJob("restore", async (reporter) => {
          enterMaintenance(
            "Sistem sedang memulihkan data. Jangan menutup halaman ini.",
          );
          try {
            reporter.onStep("Membuat safety backup", 5);
            const safety = await createBackup({
              type: "safety",
              includeUploads: true,
              createdBy: admin.username,
              onStep: (step, progress) =>
                reporter.onStep(step, 5 + Math.round(progress * 0.35)),
            });

            reporter.onStep("Memulihkan arsip", 45);
            const result = await restoreBackup({
              archivePath: resolved.filePath,
              scope,
              onStep: (step, progress) =>
                reporter.onStep(step, 45 + Math.round(progress * 0.5)),
            });

            await logSystemEvent({
              actorId: admin.id,
              actorUsername: admin.username,
              action: "restore.finish",
              detail: {
                name: resolved.name,
                safetyBackup: safety.name,
                scope,
                warnings: result.warnings,
              },
              ip,
            });

            // Restart backend agar connection pool & cache bersih.
            setTimeout(() => process.exit(0), 1_500);

            return {
              name: resolved.name,
              safetyBackup: safety.name,
              scope,
              warnings: result.warnings,
              restarted: true,
            };
          } catch (error) {
            exitMaintenance();
            await logSystemEvent({
              actorId: admin.id,
              actorUsername: admin.username,
              action: "restore.fail",
              detail: {
                name: resolved.name,
                scope,
                error: error instanceof Error ? error.message : String(error),
              },
              ip,
            });
            throw error;
          }
        });
        return status(202, { job });
      } catch (error) {
        return status(409, busyResponse(error));
      }
    },
    {
      auth: {
        roles: ["admin"],
        rateLimit: { name: "system-restore", ...RATE_LIMITS.systemRestore },
      },
      body: t.Object({
        scope: t.Union([
          t.Literal("full"),
          t.Literal("database"),
          t.Literal("uploads"),
        ]),
        password: t.String({ minLength: 1, maxLength: 128 }),
      }),
    },
  )
  .post(
    "/restore",
    async ({ body, user, request, server, status }) => {
      const admin = await loadAdmin(user.sub);
      if (!admin) return status(401, { error: "Unauthorized" });
      if (!(await verifyPassword(admin.id, body.password))) {
        return status(403, { error: "Password salah." });
      }

      const filename = (body.file.name ?? "").toLowerCase();
      if (!filename.endsWith(".tar.gz") && !filename.endsWith(".tgz")) {
        return status(400, { error: "File harus berformat .tar.gz atau .tgz." });
      }
      if (body.file.size > env.backupMaxUploadMb * 1024 * 1024) {
        return status(400, {
          error: `Ukuran file maksimal ${env.backupMaxUploadMb} MB.`,
        });
      }

      const incomingDir = path.join(backupRoot(), ".tmp");
      await mkdir(incomingDir, { recursive: true });
      const archivePath = path.join(
        incomingDir,
        `upload-${randomUUID()}.tar.gz`,
      );
      await Bun.write(archivePath, body.file);

      const ip = getClientIp(request, server);
      const scope = body.scope as BackupScope;

      try {
        const job = await startSystemJob("restore", async (reporter) => {
          enterMaintenance(
            "Sistem sedang memulihkan data. Jangan menutup halaman ini.",
          );
          try {
            reporter.onStep("Membuat safety backup", 5);
            const safety = await createBackup({
              type: "safety",
              includeUploads: true,
              createdBy: admin.username,
              onStep: (step, progress) =>
                reporter.onStep(step, 5 + Math.round(progress * 0.35)),
            });

            reporter.onStep("Memulihkan arsip unggahan", 45);
            const result = await restoreBackup({
              archivePath,
              scope,
              onStep: (step, progress) =>
                reporter.onStep(step, 45 + Math.round(progress * 0.5)),
            });

            await logSystemEvent({
              actorId: admin.id,
              actorUsername: admin.username,
              action: "restore.upload",
              detail: {
                safetyBackup: safety.name,
                scope,
                warnings: result.warnings,
              },
              ip,
            });

            setTimeout(() => process.exit(0), 1_500);

            return {
              safetyBackup: safety.name,
              scope,
              warnings: result.warnings,
              restarted: true,
            };
          } catch (error) {
            exitMaintenance();
            await logSystemEvent({
              actorId: admin.id,
              actorUsername: admin.username,
              action: "restore.fail",
              detail: {
                scope,
                error: error instanceof Error ? error.message : String(error),
              },
              ip,
            });
            throw error;
          } finally {
            await rm(archivePath, { force: true }).catch(() => {});
          }
        });
        return status(202, { job });
      } catch (error) {
        await rm(archivePath, { force: true }).catch(() => {});
        return status(409, busyResponse(error));
      }
    },
    {
      auth: {
        roles: ["admin"],
        rateLimit: { name: "system-restore", ...RATE_LIMITS.systemRestore },
      },
      body: t.Object({
        file: t.File(),
        scope: t.Union([
          t.Literal("full"),
          t.Literal("database"),
          t.Literal("uploads"),
        ]),
        password: t.String({ minLength: 1, maxLength: 128 }),
      }),
    },
  )
  .get(
    "/jobs/:id",
    async ({ params, status }) => {
      const job = await getSystemJob(params.id);
      if (!job) return status(404, { error: "Job tidak ditemukan." });
      return { job };
    },
    { auth: { roles: ["admin"] } },
  )
  .post(
    "/reset",
    async ({ body, user, request, server, status }) => {
      if (body.confirmation !== RESET_CONFIRMATION) {
        return status(400, {
          error: `Ketik ${RESET_CONFIRMATION} untuk mengonfirmasi reset.`,
        });
      }

      const admin = await loadAdmin(user.sub);
      if (!admin) return status(401, { error: "Unauthorized" });
      if (!(await verifyPassword(admin.id, body.password))) {
        return status(403, { error: "Password salah." });
      }

      const ip = getClientIp(request, server);

      try {
        const job = await startSystemJob("reset", async (reporter) => {
          enterMaintenance("Sistem sedang direset. Jangan menutup halaman ini.");
          try {
            reporter.onStep("Membuat safety backup", 10);
            const safety = await createBackup({
              type: "safety",
              includeUploads: true,
              createdBy: admin.username,
              onStep: (step, progress) =>
                reporter.onStep(step, 10 + Math.round(progress * 0.5)),
            });

            reporter.onStep("Menghapus seluruh data", 70);
            const result = await factoryReset(admin.id);

            await logSystemEvent({
              actorId: admin.id,
              actorUsername: admin.username,
              action: "reset.factory",
              detail: {
                safetyBackup: safety.name,
                deletedTables: result.deletedTables.length,
                uploadsRemoved: result.uploadsRemoved,
              },
              ip,
            });

            exitMaintenance();
            return {
              safetyBackup: safety.name,
              preservedAdmin: result.preservedAdmin,
              deletedTables: result.deletedTables,
              uploadsRemoved: result.uploadsRemoved,
            };
          } catch (error) {
            exitMaintenance();
            await logSystemEvent({
              actorId: admin.id,
              actorUsername: admin.username,
              action: "reset.fail",
              detail: {
                error: error instanceof Error ? error.message : String(error),
              },
              ip,
            });
            throw error;
          }
        });
        return status(202, { job });
      } catch (error) {
        return status(409, busyResponse(error));
      }
    },
    {
      auth: {
        roles: ["admin"],
        rateLimit: { name: "system-reset", ...RATE_LIMITS.systemReset },
      },
      body: t.Object({
        confirmation: t.String({ minLength: 1, maxLength: 50 }),
        password: t.String({ minLength: 1, maxLength: 128 }),
      }),
    },
  )
  .get(
    "/events",
    async () => {
      const events = await db
        .select()
        .from(systemEvents)
        .orderBy(desc(systemEvents.createdAt))
        .limit(100);

      return { events };
    },
    {
      auth: {
        roles: ["admin"],
        rateLimit: { name: "system-status", ...RATE_LIMITS.systemStatus },
      },
    },
  );
