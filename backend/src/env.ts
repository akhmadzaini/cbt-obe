function parseDatabaseUrl(raw: string) {
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}

export const dbConfig = process.env.DB_HOST
  ? {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER ?? "cbt",
      password: process.env.DB_PASSWORD ?? "",
      database: process.env.DB_NAME ?? "cbt",
    }
  : parseDatabaseUrl(
      process.env.DATABASE_URL ?? "mysql://cbt:cbt@localhost:3306/cbt",
    );

function positiveIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret:
    process.env.JWT_SECRET ?? "dev-only-secret-change-me-at-least-32-chars",
  bindIp: (process.env.BIND_IP ?? "false").toLowerCase() === "true",
  uploadDir: process.env.UPLOAD_DIR ?? "./data/uploads",
  seedOnStart: (process.env.SEED_ON_START ?? "false").toLowerCase() === "true",
  seedAdminUsername: process.env.SEED_ADMIN_USERNAME ?? "admin",
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? "admin12345",
  seedStudentUsername: process.env.SEED_STUDENT_USERNAME ?? "siswa",
  seedStudentPassword: process.env.SEED_STUDENT_PASSWORD ?? "siswa12345",
  trustProxy: (process.env.TRUST_PROXY ?? "true").toLowerCase() === "true",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
  rateLimitEnabled:
    (process.env.RATE_LIMIT_ENABLED ?? "true").toLowerCase() !== "false",
  loginIpLimit: positiveIntEnv(process.env.LOGIN_IP_LIMIT, 300),
  loginUserLimit: positiveIntEnv(process.env.LOGIN_USER_LIMIT, 5),
  loginWindowSeconds: positiveIntEnv(process.env.LOGIN_WINDOW_SECONDS, 300),
  backupEnabled:
    (process.env.BACKUP_ENABLED ?? "true").toLowerCase() !== "false",
  backupDir: process.env.BACKUP_DIR ?? "./data/backups",
  backupRetentionCount: positiveIntEnv(process.env.BACKUP_RETENTION_COUNT, 10),
  backupMaxUploadMb: positiveIntEnv(process.env.BACKUP_MAX_UPLOAD_MB, 1024),
} as const;
