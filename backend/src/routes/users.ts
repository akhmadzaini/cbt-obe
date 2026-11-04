import { randomUUID } from "node:crypto";
import { Elysia, t } from "elysia";
import ExcelJS from "exceljs";
import { and, asc, eq, inArray, like, ne, or } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { authPlugin } from "../lib/auth-plugin";
import { isDuplicateEntry, isRowReferencedError } from "../lib/db-errors";
import { RATE_LIMITS } from "../lib/rate-limit";

import {
  ACTIVE_ALIASES,
  FULLNAME_ALIASES,
  MAX_FILE_BYTES,
  MAX_IMPORT_ROWS,
  PASSWORD_ALIASES,
  TEMPLATE_FILENAME,
  USERNAME_ALIASES,
  buildTemplate,
  cellText,
  findColumn,
  hashPasswords,
  normalizeHeader,
  parseActive,
} from "../lib/participant-import";
import { getParticipantUsage } from "../lib/participant-usage";
import {
  validateFullName,
  validateNewPassword,
  validateUsername,
} from "../lib/participant-validation";


const publicUserColumns = {
  id: users.id,
  username: users.username,
  fullName: users.fullName,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
};


export const userRoutes = new Elysia({ prefix: "/api/users" })
  .use(authPlugin)
  .get(
    "/",
    async ({ query }) => {
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
      auth: { roles: ["admin", "teacher"] },
      query: t.Object({
        role: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/",
    async ({ body, status }) => {
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
      auth: {
        roles: ["admin", "teacher"],
        rateLimit: { name: "user-create", ...RATE_LIMITS.crud },
      },
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
    async () => {
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
    { auth: { roles: ["admin", "teacher"] } },
  )
  .get(
    "/:id/usage",
    async ({ params, status }) => {
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
    { auth: { roles: ["admin", "teacher"] } },
  )
  .patch(
    "/:id",
    async ({ params, body, status }) => {
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
      auth: { roles: ["admin", "teacher"] },
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
    async ({ params, status }) => {
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
        if (isRowReferencedError(error)) {
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
    { auth: { roles: ["admin", "teacher"] } },
  )
  .post(
    "/import",
    async ({ body, status }) => {
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
      auth: {
        roles: ["admin", "teacher"],
        rateLimit: { name: "user-import", ...RATE_LIMITS.userImport },
      },
      body: t.Object({
        file: t.File(),
        mode: t.Optional(t.String()),
      }),
    },
  );

