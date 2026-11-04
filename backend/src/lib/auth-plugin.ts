import { Elysia } from "elysia";
import { authenticate, jwtPlugin, type AuthUser } from "./auth";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  rateLimitMessage,
} from "./rate-limit";

export type Role = AuthUser["role"];

type AuthOptions = {
  roles?: readonly Role[];
  rateLimit?: {
    name: string;
    limit: number;
    windowSeconds: number;
  };
};

/**
 * Plugin autentikasi bersama.
 *
 * Pemakaian:
 *   { auth: true }                                  -> semua user login
 *   { auth: { roles: ["admin", "teacher"] } }       -> login + role
 *   { auth: { rateLimit: { ... } } }                -> login + rate limit
 *   { auth: { roles: [...], rateLimit: { ... } } }  -> login + role + limit
 */
export const authPlugin = new Elysia({ name: "cbt-auth" })
  .use(jwtPlugin)
  .macro({
    auth(options: true | AuthOptions = true) {
      const config = options === true ? {} : options;

      return {
        resolve: async ({ headers, request, server, jwt, set, status }) => {
          const user = await authenticate({ headers, request, server, jwt });
          if (!user) return status(401, { error: "Unauthorized" });

          if (config.roles && !config.roles.includes(user.role)) {
            return status(403, { error: "Akses ditolak." });
          }

          if (config.rateLimit) {
            const limit = checkRateLimit(
              `${config.rateLimit.name}:${user.sub}`,
              config.rateLimit.limit,
              config.rateLimit.windowSeconds,
            );
            if (!limit.allowed) {
              applyRateLimitHeaders(set, limit);
              return status(429, { error: rateLimitMessage(limit) });
            }
          }

          return { user };
        },
      };
    },
  });
