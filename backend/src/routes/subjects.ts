import { randomUUID } from "node:crypto";
import { Elysia, t } from "elysia";
import { asc } from "drizzle-orm";
import { db } from "../db";
import { subjects } from "../db/schema";
import { authPlugin } from "../lib/auth-plugin";

export const subjectRoutes = new Elysia({ prefix: "/api/subjects" })
  .use(authPlugin)
  .get(
    "/",
    async () => {
      const rows = await db.select().from(subjects).orderBy(asc(subjects.name));
      return { subjects: rows };
    },
    { auth: true },
  )
  .post(
    "/",
    async ({ body }) => {
      const id = randomUUID();
      await db.insert(subjects).values({
        id,
        code: body.code,
        name: body.name,
      });

      return { subject: { id, code: body.code, name: body.name } };
    },
    {
      auth: { roles: ["admin", "teacher"] },
      body: t.Object({
        code: t.String({ minLength: 1, maxLength: 30 }),
        name: t.String({ minLength: 1, maxLength: 150 }),
      }),
    },
  );
