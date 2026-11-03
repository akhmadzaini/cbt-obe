import { randomUUID } from "node:crypto";
import { Elysia, t } from "elysia";
import ExcelJS from "exceljs";
import { and, asc, eq, inArray, like, ne, or } from "drizzle-orm";
import { db } from "../db";
import { examSessions, users } from "../db/schema";
import { authenticate, jwtPlugin, requireRole } from "../lib/auth";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  RATE_LIMITS,
  rateLimitMessage,
} from "../lib/rate-limit";

const MAX_IMPORT_ROWS = 1000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const TEMPLATE_FILENAME = "template-import-peserta.xlsx";

const USERNAME_ALIASES = new Set(["username", "user", "userid", "idpeserta"]);
const FULLNAME_ALIASES = new Set([
  "fullname",
  "namalengkap",
  "nama",
  "name",
]);
const PASSWORD_ALIASES = new Set(["password", "katasandi", "pass"]);
const ACTIVE_ALIASES = new Set([
  "isactive",
  "aktif",
  "statusaktif",
  "aktifyatidak",
]);

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(
  headers: Map<string, number>,
  aliases: Set<string>,
): number | undefined {
  for (const [header, column] of headers) {
    if (aliases.has(header)) return column;
  }
  return undefined;
}

function cellText(row: ExcelJS.Row, column: number | undefined): string {
  if (!column) return "";
  return row.getCell(column).text.trim();
}

function parseActive(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (["ya", "y", "true", "1", "aktif", "active"].includes(normalized)) {
    return true;
  }
  if (
    ["tidak", "t", "false", "0", "nonaktif", "inactive"].includes(normalized)
  ) {
    return false;
  }
  return null;
}

async function buildTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CBT";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Peserta", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Username", key: "username", width: 26 },
    { header: "Nama Lengkap", key: "fullName", width: 34 },
    { header: "Password", key: "password", width: 24 },
    { header: "Aktif (Ya/Tidak)", key: "isActive", width: 18 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2F56D4" },
  };
  header.alignment = { vertical: "middle" };
  header.height = 24;

  sheet.addRow({
    username: "siswa001",
    fullName: "Budi Santoso",
    password: "rahasia123",
    isActive: "Ya",
  });
  sheet.addRow({
    username: "siswa002",
    fullName: "Siti Aminah",
    password: "rahasia123",
    isActive: "Ya",
  });

  sheet.getColumn(1).numFmt = "@";
  sheet.getColumn(3).numFmt = "@";
  sheet.autoFilter = { from: "A1", to: "D1" };

  for (let rowNumber = 2; rowNumber <= MAX_IMPORT_ROWS + 1; rowNumber++) {
    sheet.getCell(`D${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Ya,Tidak"'],
      showErrorMessage: true,
      errorTitle: "Nilai tidak valid",
      error: "Pilih Ya atau Tidak.",
    };
  }

  const guide = workbook.addWorksheet("Petunjuk");
  guide.columns = [{ width: 24 }, { width: 96 }];
  guide.addRows([
    ["Kolom", "Keterangan"],
    [
      "Username",
      "Wajib. Unik, 3-100 karakter, tanpa spasi. Contoh: siswa001 atau NISN.",
    ],
    ["Nama Lengkap", "Wajib. Maksimal 150 karakter."],
    [
      "Password",
      "Wajib. Minimal 8 karakter. Password akan di-hash saat import.",
    ],
    ["Aktif (Ya/Tidak)", "Opsional. Kosong dianggap Ya."],
    [],
    ["Catatan", "Import hanya membuat akun peserta (role student)."],
    [
      "",
      "Username yang sudah ada akan dilewati dan dilaporkan, kecuali memilih mode perbarui.",
    ],
    ["", "Baris contoh boleh dihapus sebelum file di-import."],
  ]);
  guide.getRow(1).font = { bold: true };
  guide.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  guide.eachRow((row) => {
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

async function hashPasswords(
  passwords: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(passwords)];
  const hashes = new Map<string, string>();
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(8, Math.max(1, unique.length)) },
    async () => {
      while (cursor < unique.length) {
        const password = unique[cursor]!;
        cursor += 1;
        hashes.set(password, await Bun.password.hash(password));
      }
    },
  );
  await Promise.all(workers);
  return hashes;
}

const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

const publicUserColumns = {
  id: users.id,
  username: users.username,
  fullName: users.fullName,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

export type ParticipantUsage = {
  userId: string;
  sessionCount: number;
  activeSessionCount: number;
  finishedSessionCount: number;
  lastSessionAt: string | null;
  canDelete: boolean;
  reasons: string[];
};

async function getParticipantUsage(
  userId: string,
): Promise<ParticipantUsage> {
  const rows = await db
    .select({
      id: examSessions.id,
      status: examSessions.status,
      startedAt: examSessions.startedAt,
      finishedAt: examSessions.finishedAt,
    })
    .from(examSessions)
    .where(eq(examSessions.userId, userId));

  const activeSessionCount = rows.filter(
    (row) => row.status === "started" || row.status === "in_progress",
  ).length;
  const finishedSessionCount = rows.filter(
    (row) => row.status === "finished",
  ).length;
  const lastSessionAt = rows.reduce<Date | null>((latest, row) => {
    const candidate = row.finishedAt ?? row.startedAt;
    if (!candidate) return latest;
    if (!latest || candidate.getTime() > latest.getTime()) return candidate;
    return latest;
  }, null);

  const reasons: string[] = [];
  if (activeSessionCount > 0) {
    reasons.push("Peserta memiliki sesi ujian yang sedang berlangsung.");
  }
  if (rows.length > 0) {
    reasons.push(`Peserta sudah memiliki ${rows.length} sesi ujian.`);
  }

  return {
    userId,
    sessionCount: rows.length,
    activeSessionCount,
    finishedSessionCount,
    lastSessionAt: lastSessionAt ? lastSessionAt.toISOString() : null,
    canDelete: rows.length === 0,
    reasons,
  };
}

function validateUsername(value: string): string | null {
  if (value.length < 3 || value.length > 100) {
    return "Username harus 3-100 karakter.";
  }
  if (!USERNAME_PATTERN.test(value)) {
    return "Username hanya boleh berisi huruf, angka, titik, underscore, atau tanda hubung.";
  }
  return null;
}

function validateFullName(value: string): string | null {
  if (!value) return "Nama lengkap wajib diisi.";
  if (value.length > 150) return "Nama lengkap maksimal 150 karakter.";
  return null;
}

function validateNewPassword(value: string): string | null {
  if (value.length < 8 || value.length > 128) {
    return "Password harus 8-128 karakter.";
  }
  return null;
}

function isDuplicateEntry(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ER_DUP_ENTRY",
  );
}

function isForeignKeyError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: string }).code
      : undefined;
  return code === "ER_ROW_IS_REFERENCED_2" || code === "ER_ROW_IS_REFERENCED";
}

export const userRoutes = new Elysia({ prefix: "/api/users" })
  .use(jwtPlugin)
  .get(
    "/",
    async ({ query, headers, request, server, jwt, status }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!requireRole(user, ["admin", "teacher"])) {
        return status(403, { error: "Akses ditolak." });
      }

      const role =
        query.role === "admin" ||
        query.role === "teacher" ||
        query.role === "student"
          ? query.role
          : undefined;
      const search = (query.search ?? "").trim();
      const conditions = [];
      if (role) conditions.push(eq(users.role, role));
      if (search) {
        conditions.push(
          or(
            like(users.username, `%${search}%`),
            like(users.fullName, `%${search}%`),
          ),
        );
      }

      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          fullName: users.fullName,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(users.fullName))
        .limit(1000);

      return { users: rows };
    },
    {
      query: t.Object({
        role: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/",
    async ({ body, headers, request, server, jwt, status, set }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!requireRole(user, ["admin", "teacher"])) {
        return status(403, { error: "Akses ditolak." });
      }

      const limit = checkRateLimit(
        `user-create:${user.sub}`,
        RATE_LIMITS.crud.limit,
        RATE_LIMITS.crud.windowSeconds,
      );
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      const username = body.username.trim();
      const fullName = body.fullName.trim();

      const usernameError = validateUsername(username);
      if (usernameError) return status(400, { error: usernameError });
      const fullNameError = validateFullName(fullName);
      if (fullNameError) return status(400, { error: fullNameError });
      const passwordError = validateNewPassword(body.password);
      if (passwordError) return status(400, { error: passwordError });

      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      if (existing) {
        return status(409, { error: "Username sudah digunakan." });
      }

      const userId = randomUUID();
      try {
        await db.insert(users).values({
          id: userId,
          username,
          passwordHash: await Bun.password.hash(body.password),
          fullName,
          role: "student",
          isActive: body.isActive ?? true,
        });
      } catch (error) {
        if (isDuplicateEntry(error)) {
          return status(409, { error: "Username sudah digunakan." });
        }
        throw error;
      }

      const [created] = await db
        .select(publicUserColumns)
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return { user: created };
    },
    {
      body: t.Object({
        username: t.String(),
        fullName: t.String(),
        password: t.String(),
        isActive: t.Optional(t.Boolean()),
      }),
    },
  )
  .get(
    "/template",
    async ({ headers, request, server, jwt, status }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!requireRole(user, ["admin", "teacher"])) {
        return status(403, { error: "Akses ditolak." });
      }

      const buffer = await buildTemplate();
      return new Response(buffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${TEMPLATE_FILENAME}"`,
          "Content-Length": String(buffer.length),
          "Cache-Control": "no-store",
        },
      });
    },
  )
  .get(
    "/:id/usage",
    async ({ params, headers, request, server, jwt, status }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!requireRole(user, ["admin", "teacher"])) {
        return status(403, { error: "Akses ditolak." });
      }

      const [target] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, params.id))
        .limit(1);
      if (!target) return status(404, { error: "Peserta tidak ditemukan." });
      if (target.role !== "student") {
        return status(403, {
          error: "Hanya akun peserta yang dapat dikelola di halaman ini.",
        });
      }

      return await getParticipantUsage(target.id);
    },
  )
  .patch(
    "/:id",
    async ({ params, body, headers, request, server, jwt, status }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!requireRole(user, ["admin", "teacher"])) {
        return status(403, { error: "Akses ditolak." });
      }

      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, params.id))
        .limit(1);
      if (!target) return status(404, { error: "Peserta tidak ditemukan." });
      if (target.role !== "student") {
        return status(403, {
          error: "Hanya akun peserta yang dapat diubah di halaman ini.",
        });
      }

      const updates: Partial<typeof users.$inferInsert> = {};

      if (body.username !== undefined) {
        const username = body.username.trim();
        const usernameError = validateUsername(username);
        if (usernameError) return status(400, { error: usernameError });

        if (username !== target.username) {
          const [conflict] = await db
            .select({ id: users.id })
            .from(users)
            .where(
              and(eq(users.username, username), ne(users.id, target.id)),
            )
            .limit(1);
          if (conflict) {
            return status(409, { error: "Username sudah digunakan." });
          }
          updates.username = username;
        }
      }

      if (body.fullName !== undefined) {
        const fullName = body.fullName.trim();
        const fullNameError = validateFullName(fullName);
        if (fullNameError) return status(400, { error: fullNameError });
        updates.fullName = fullName;
      }

      if (body.isActive !== undefined) {
        updates.isActive = body.isActive;
      }

      if (body.password !== undefined && body.password.length > 0) {
        const passwordError = validateNewPassword(body.password);
        if (passwordError) return status(400, { error: passwordError });
        updates.passwordHash = await Bun.password.hash(body.password);
      }

      updates.updatedAt = new Date();

      try {
        await db.update(users).set(updates).where(eq(users.id, target.id));
      } catch (error) {
        if (isDuplicateEntry(error)) {
          return status(409, { error: "Username sudah digunakan." });
        }
        throw error;
      }

      const [updated] = await db
        .select(publicUserColumns)
        .from(users)
        .where(eq(users.id, target.id))
        .limit(1);

      return { user: updated };
    },
    {
      body: t.Object({
        username: t.Optional(t.String()),
        fullName: t.Optional(t.String()),
        password: t.Optional(t.String()),
        isActive: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ params, headers, request, server, jwt, status }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!requireRole(user, ["admin", "teacher"])) {
        return status(403, { error: "Akses ditolak." });
      }

      const [target] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, params.id))
        .limit(1);
      if (!target) return status(404, { error: "Peserta tidak ditemukan." });
      if (target.role !== "student") {
        return status(403, {
          error: "Hanya akun peserta yang dapat dihapus di halaman ini.",
        });
      }

      const usage = await getParticipantUsage(target.id);
      if (!usage.canDelete) {
        return status(409, {
          error:
            "Peserta sudah memiliki sesi ujian dan tidak dapat dihapus. Nonaktifkan akun sebagai gantinya.",
          usage,
        });
      }

      try {
        await db.delete(users).where(eq(users.id, target.id));
      } catch (error) {
        if (isForeignKeyError(error)) {
          const latestUsage = await getParticipantUsage(target.id);
          return status(409, {
            error:
              "Peserta masih terhubung dengan data ujian dan tidak dapat dihapus. Nonaktifkan akun sebagai gantinya.",
            usage: latestUsage,
          });
        }
        throw error;
      }

      return { ok: true, id: target.id };
    },
  )
  .post(
    "/import",
    async ({ body, headers, request, server, jwt, status, set }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!requireRole(user, ["admin", "teacher"])) {
        return status(403, { error: "Akses ditolak." });
      }

      const limit = checkRateLimit(
        `user-import:${user.sub}`,
        RATE_LIMITS.userImport.limit,
        RATE_LIMITS.userImport.windowSeconds,
      );
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      const filename = (body.file.name ?? "").toLowerCase();
      if (!filename.endsWith(".xlsx")) {
        return status(400, {
          error: "Format file harus .xlsx. Gunakan template yang disediakan.",
        });
      }
      if (body.file.size > MAX_FILE_BYTES) {
        return status(400, { error: "Ukuran file maksimal 5 MB." });
      }

      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(await body.file.arrayBuffer());
      } catch {
        return status(400, { error: "File Excel tidak valid atau rusak." });
      }

      const sheet =
        workbook.getWorksheet("Peserta") ?? workbook.worksheets[0] ?? null;
      if (!sheet) {
        return status(400, { error: "Worksheet tidak ditemukan." });
      }

      const headerRow = sheet.getRow(1);
      const headerColumns = new Map<string, number>();
      headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        const normalized = normalizeHeader(cell.text);
        if (normalized) headerColumns.set(normalized, columnNumber);
      });

      const usernameColumn = findColumn(headerColumns, USERNAME_ALIASES);
      const fullNameColumn = findColumn(headerColumns, FULLNAME_ALIASES);
      const passwordColumn = findColumn(headerColumns, PASSWORD_ALIASES);
      const activeColumn = findColumn(headerColumns, ACTIVE_ALIASES);

      if (!usernameColumn || !fullNameColumn || !passwordColumn) {
        return status(400, {
          error:
            "Header wajib tidak ditemukan. Gunakan kolom Username, Nama Lengkap, dan Password dari template.",
        });
      }

      const mode = body.mode === "update" ? "update" : "skip";
      const errors: { row: number; username: string; message: string }[] = [];
      const validRows: {
        rowNumber: number;
        username: string;
        fullName: string;
        password: string;
        isActive: boolean;
      }[] = [];
      const seenUsernames = new Set<string>();
      let processedRows = 0;

      for (
        let rowNumber = 2;
        rowNumber <= sheet.rowCount;
        rowNumber += 1
      ) {
        const row = sheet.getRow(rowNumber);
        const username = cellText(row, usernameColumn);
        const fullName = cellText(row, fullNameColumn);
        const password = cellText(row, passwordColumn);
        const activeRaw = cellText(row, activeColumn);

        if (!username && !fullName && !password && !activeRaw) continue;

        processedRows += 1;
        if (processedRows > MAX_IMPORT_ROWS) {
          return status(400, {
            error: `Maksimal ${MAX_IMPORT_ROWS} baris data per import.`,
          });
        }

        if (!username) {
          errors.push({
            row: rowNumber,
            username: "",
            message: "Username wajib diisi.",
          });
          continue;
        }
        if (username.length < 3 || username.length > 100) {
          errors.push({
            row: rowNumber,
            username,
            message: "Username harus 3-100 karakter.",
          });
          continue;
        }
        if (!/^[A-Za-z0-9._-]+$/.test(username)) {
          errors.push({
            row: rowNumber,
            username,
            message:
              "Username hanya boleh berisi huruf, angka, titik, underscore, atau tanda hubung.",
          });
          continue;
        }

        const usernameKey = username.toLowerCase();
        if (seenUsernames.has(usernameKey)) {
          errors.push({
            row: rowNumber,
            username,
            message: "Username duplikat di dalam file.",
          });
          continue;
        }
        seenUsernames.add(usernameKey);

        if (!fullName) {
          errors.push({
            row: rowNumber,
            username,
            message: "Nama lengkap wajib diisi.",
          });
          continue;
        }
        if (fullName.length > 150) {
          errors.push({
            row: rowNumber,
            username,
            message: "Nama lengkap maksimal 150 karakter.",
          });
          continue;
        }

        if (!password) {
          errors.push({
            row: rowNumber,
            username,
            message: "Password wajib diisi.",
          });
          continue;
        }
        if (password.length < 8 || password.length > 128) {
          errors.push({
            row: rowNumber,
            username,
            message: "Password harus 8-128 karakter.",
          });
          continue;
        }

        const isActive = parseActive(activeRaw);
        if (isActive === null) {
          errors.push({
            row: rowNumber,
            username,
            message: "Kolom Aktif harus Ya atau Tidak.",
          });
          continue;
        }

        validRows.push({
          rowNumber,
          username,
          fullName,
          password,
          isActive,
        });
      }

      if (validRows.length === 0) {
        return {
          totalRows: processedRows,
          imported: 0,
          updated: 0,
          skipped: 0,
          failed: errors.length,
          errors: errors.slice(0, 100),
        };
      }

      const existingRows = await db
        .select({
          id: users.id,
          username: users.username,
          role: users.role,
        })
        .from(users)
        .where(
          inArray(
            users.username,
            validRows.map((row) => row.username),
          ),
        );
      const existingByUsername = new Map(
        existingRows.map((row) => [row.username.toLowerCase(), row]),
      );

      const toCreate: typeof validRows = [];
      const toUpdate: { id: string; row: (typeof validRows)[number] }[] = [];
      let skipped = 0;

      for (const row of validRows) {
        const existing = existingByUsername.get(row.username.toLowerCase());
        if (!existing) {
          toCreate.push(row);
          continue;
        }
        if (existing.role !== "student") {
          errors.push({
            row: row.rowNumber,
            username: row.username,
            message: "Username sudah dipakai akun non-peserta.",
          });
          continue;
        }
        if (mode === "update") {
          toUpdate.push({ id: existing.id, row });
        } else {
          skipped += 1;
        }
      }

      const hashes = await hashPasswords([
        ...toCreate.map((row) => row.password),
        ...toUpdate.map((item) => item.row.password),
      ]);

      try {
        await db.transaction(async (tx) => {
          const insertValues = toCreate.map((row) => ({
            id: randomUUID(),
            username: row.username,
            passwordHash: hashes.get(row.password)!,
            fullName: row.fullName,
            role: "student" as const,
            isActive: row.isActive,
          }));

          for (let index = 0; index < insertValues.length; index += 200) {
            await tx.insert(users).values(insertValues.slice(index, index + 200));
          }

          for (const item of toUpdate) {
            await tx
              .update(users)
              .set({
                passwordHash: hashes.get(item.row.password)!,
                fullName: item.row.fullName,
                isActive: item.row.isActive,
                updatedAt: new Date(),
              })
              .where(eq(users.id, item.id));
          }
        });
      } catch (error) {
        console.error("[users/import] gagal menyimpan", error);
        return status(500, {
          error: "Gagal menyimpan data peserta. Silakan coba lagi.",
        });
      }

      return {
        totalRows: processedRows,
        imported: toCreate.length,
        updated: toUpdate.length,
        skipped,
        failed: errors.length,
        errors: errors.slice(0, 100),
      };
    },
    {
      body: t.Object({
        file: t.File(),
        mode: t.Optional(t.String()),
      }),
    },
  );
