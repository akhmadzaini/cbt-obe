import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { getMysqlConfig } from "./index";

/**
 * Menjalankan file SQL di src/db/migrations secara berurutan.
 * Idempoten: file yang sudah tercatat di _migrations akan dilewati.
 */
export async function migrate(): Promise<void> {
  const connection = await mysql.createConnection({
    ...getMysqlConfig(),
    multipleStatements: true,
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const dir = path.join(import.meta.dir, "migrations");
    const files = (await readdir(dir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const [rows] = await connection.query(
        "SELECT id FROM _migrations WHERE id = ?",
        [file],
      );
      if (Array.isArray(rows) && rows.length > 0) continue;

      const sqlText = await readFile(path.join(dir, file), "utf8");
      await connection.query(sqlText);
      await connection.query("INSERT INTO _migrations (id) VALUES (?)", [file]);
      console.log(`[migrate] applied ${file}`);
    }
  } finally {
    await connection.end();
  }
}
