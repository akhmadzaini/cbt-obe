import type { RowDataPacket } from "mysql2";
import { pool } from "../db";
import { clearUploads } from "./backup";

export type FactoryResetResult = {
  deletedTables: string[];
  preservedAdmin: string;
  uploadsRemoved: number;
};

type AdminRow = RowDataPacket & {
  id: string;
  username: string;
  password_hash: string;
  full_name: string;
  role: string;
  is_active: number | boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

/**
 * Factory reset: menghapus seluruh data operasional dan seluruh akun kecuali
 * admin yang sedang menjalankan reset. Skema (tabel + `_migrations`) dan audit
 * `system_events` dipertahankan.
 */
export async function factoryReset(
  adminId: string,
): Promise<FactoryResetResult> {
  const connection = await pool.getConnection();

  try {
    const [adminRows] = await connection.query<AdminRow[]>(
      `SELECT id, username, password_hash, full_name, role, is_active,
              created_at, updated_at
         FROM users WHERE id = ? LIMIT 1`,
      [adminId],
    );
    const admin = adminRows[0];
    if (!admin) {
      throw new Error("Akun admin yang sedang login tidak ditemukan.");
    }

    const [tableRows] = await connection.query<RowDataPacket[]>("SHOW TABLES");
    const tables = tableRows
      .map((row) => String(Object.values(row)[0] ?? ""))
      .filter(
        (table) =>
          table &&
          table !== "_migrations" &&
          table !== "system_events" &&
          /^[A-Za-z0-9_]+$/.test(table),
      );

    if (!tables.includes("users")) {
      throw new Error("Tabel users tidak ditemukan; reset dibatalkan.");
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
      for (const table of tables) {
        await connection.query(`TRUNCATE TABLE \`${table}\``);
      }

      await connection.query(
        `INSERT INTO users
           (id, username, password_hash, full_name, role, is_active,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          admin.id,
          admin.username,
          admin.password_hash,
          admin.full_name,
          admin.role,
          admin.is_active ? 1 : 0,
          admin.created_at,
          admin.updated_at,
        ],
      );
    } finally {
      await connection.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
    }

    const uploadsRemoved = await clearUploads();

    return {
      deletedTables: tables.filter((table) => table !== "users"),
      preservedAdmin: admin.username,
      uploadsRemoved,
    };
  } finally {
    connection.release();
  }
}
