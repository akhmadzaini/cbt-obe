import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import {
  authenticate,
  deviceFingerprint,
  getClientIp,
  jwtPlugin,
} from "../lib/auth";
import {
  applyRateLimitHeaders,
  checkLoginRateLimit,
  rateLimitMessage,
  resetLoginUsernameLimit,
} from "../lib/rate-limit";

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .use(jwtPlugin)
  .post(
    "/login",
    async ({ body, jwt, request, server, status, set }) => {
      const ip = getClientIp(request, server as never);
      const limit = checkLoginRateLimit(ip, body.username);
      if (!limit.allowed) {
        applyRateLimitHeaders(set, limit);
        return status(429, { error: rateLimitMessage(limit) });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, body.username))
        .limit(1);

      if (!user || !user.isActive) {
        return status(401, { error: "Username atau password salah." });
      }

      const valid = await Bun.password.verify(
        body.password,
        user.passwordHash,
      );
      if (!valid) {
        return status(401, { error: "Username atau password salah." });
      }

      resetLoginUsernameLimit(body.username);

      const userAgent = request.headers.get("user-agent") ?? "";
      const token = await jwt.sign({
        sub: user.id,
        role: user.role,
        ua: deviceFingerprint(userAgent, ip),
      });

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
        },
      };
    },
    {
      body: t.Object({
        username: t.String(),
        password: t.String(),
      }),
    },
  )
  .get("/me", async ({ headers, request, server, jwt, status }) => {
    const authUser = await authenticate({
      headers,
      request,
      server: server as never,
      jwt,
    });
    if (!authUser) return status(401, { error: "Unauthorized" });

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, authUser.sub))
      .limit(1);

    if (!user) return status(401, { error: "Unauthorized" });

    return {
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    };
  });
