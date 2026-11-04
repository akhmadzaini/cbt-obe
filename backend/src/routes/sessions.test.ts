import { describe, expect, test } from "bun:test";
import { sessionRoutes } from "./sessions";

function routes(): string[] {
  return sessionRoutes.routes.map((route) => `${route.method} ${route.path}`);
}

describe("sessionRoutes", () => {
  test("mendaftarkan seluruh endpoint sesi ujian", () => {
    expect(routes()).toEqual([
      "POST /api/sessions/start",
      "GET /api/sessions/:id",
      "GET /api/sessions/:id/result",
      "PUT /api/sessions/:id/answers/:questionId",
      "POST /api/sessions/:id/violations",
      "POST /api/sessions/:id/pause",
      "POST /api/sessions/:id/resume",
      "POST /api/sessions/:id/heartbeat",
      "POST /api/sessions/:id/submit",
    ]);
  });
});
