import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { dbConfig } from "../env";
import * as schema from "./schema";

export function getMysqlConfig() {
  return {
    ...dbConfig,
    connectionLimit: 10,
    timezone: "Z" as const,
    charset: "utf8mb4",
    decimalNumbers: true,
    supportBigNumbers: true,
  };
}

export const pool = mysql.createPool(getMysqlConfig());

export const db = drizzle(pool, { schema, mode: "default" });

export type Database = typeof db;
export { schema };
