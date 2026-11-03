import { randomUUID } from "node:crypto";
import { Elysia, t } from "elysia";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { subjects } from "../db/schema";
import { authenticate, jwtPlugin, requireRole } from "../lib/auth";

export const subjectRoutes = new Elysia({ prefix: "/api/subjects" })
  .use(jwtPlugin)
  .get("/", async ({ headers, request, server, jwt, status }) => {
    const user = await authenticate({
      headers,
      request,
      server: server as never,
      jwt,
    });
    if (!user) return status(401, { error: "Unauthorized" });

    const rows = await db.select().from(subjects).orderBy(asc(subjects.name));
    return { subjects: rows };
  })
  .post(
    "/",
    async ({ body, headers, request, server, jwt, status }) => {
      const user = await authenticate({
        headers,
        request,
        server: server as never,
        jwt,
      });
      if (!requireRole(user, ["admin", "teacher"])) {
        return status(403, { error: "Hanya admin/guru yang boleh membuat mapel." });
      }

      const id = randomUUID();
      await db.insert(subjects).values({
        id,
        code: body.code,
        name: body.name,
      });

      return { subject: { id, code: body.code, name: body.name } };
    },
    {
      body: t.Object({
        code: t.String({ minLength: 1, maxLength: 30 }),
        name: t.String({ minLength: 1, maxLength: 150 }),
      }),
    },
  );
