import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { migrate } from "./db/migrate";
import { env } from "./env";
import { authRoutes } from "./routes/auth";
import { examRoutes } from "./routes/exams";
import { gradingRoutes } from "./routes/grading";
import { importRoutes } from "./routes/imports";
import { questionRoutes } from "./routes/questions";
import { resultRoutes } from "./routes/results";
import { sessionRoutes } from "./routes/sessions";
import { subjectRoutes } from "./routes/subjects";
import { systemRoutes } from "./routes/system";
import { userRoutes } from "./routes/users";
import { seedDemoData } from "./seed";
import {
  isMaintenance,
  maintenanceMessage,
} from "./lib/maintenance";
import { recoverInterruptedJobs } from "./lib/system-jobs";

await mkdir(env.uploadDir, { recursive: true });
await mkdir(env.backupDir, { recursive: true });
await recoverInterruptedJobs();
await migrate();
if (env.seedOnStart) await seedDemoData();

const uploadRoot = path.resolve(env.uploadDir);

const app = new Elysia()
  .use(cors({ origin: true, credentials: true }))
  .onBeforeHandle(({ request, set }) => {
    if (!isMaintenance()) return;
    if (request.method === "OPTIONS") return;

    const pathname = new URL(request.url).pathname;
    const allowed =
      pathname === "/api/health" ||
      pathname === "/api/auth/login" ||
      pathname.startsWith("/api/system/") ||
      pathname.startsWith("/uploads/");
    if (allowed) return;

    set.status = 503;
    return {
      error: maintenanceMessage(),
      maintenance: true,
    };
  })
  .onAfterHandle(({ set, request }) => {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      set.headers["cache-control"] = "no-store";
    }
  })
  .get("/api/health", () => ({
    ok: true,
    time: new Date().toISOString(),
    maintenance: isMaintenance(),
    maintenanceMessage: isMaintenance() ? maintenanceMessage() : null,
  }))
  .get("/uploads/*", async ({ params, status }) => {
    const relative = params["*"];
    if (!relative || relative.includes("\0")) {
      return status(404, { error: "File tidak ditemukan." });
    }

    // Cegah path traversal: file wajib berada di dalam UPLOAD_DIR.
    const absolute = path.resolve(uploadRoot, relative);
    if (
      absolute !== uploadRoot &&
      !absolute.startsWith(`${uploadRoot}${path.sep}`)
    ) {
      return status(404, { error: "File tidak ditemukan." });
    }

    try {
      const info = await stat(absolute);
      if (!info.isFile()) {
        return status(404, { error: "File tidak ditemukan." });
      }
    } catch {
      return status(404, { error: "File tidak ditemukan." });
    }

    return new Response(Bun.file(absolute), {
      headers: {
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  })
  .use(authRoutes)
  .use(subjectRoutes)
  .use(questionRoutes)
  .use(examRoutes)
  .use(importRoutes)
  .use(gradingRoutes)
  .use(resultRoutes)
  .use(userRoutes)
  .use(sessionRoutes)
  .use(systemRoutes)
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "Validasi gagal.", detail: error.message };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Endpoint tidak ditemukan." };
    }
    console.error("[error]", error);
    set.status = 500;
    return {
      error: error instanceof Error ? error.message : "Internal server error",
    };
  })
  .listen({
    port: env.port,
    // Beri ruang untuk overhead multipart saat upload arsip restore.
    maxRequestBodySize: (Math.max(16, env.backupMaxUploadMb) + 8) * 1024 * 1024,
  });

console.log(`[cbt] backend berjalan di http://localhost:${env.port}`);

export type App = typeof app;
