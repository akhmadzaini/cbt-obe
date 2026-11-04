import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { authPlugin } from "./auth-plugin";

function createApp() {
  return new Elysia()
    .use(authPlugin)
    .get("/sign", ({ jwt }) => jwt.sign({ sub: "test" }))
    .get("/protected", ({ user }) => ({ id: user.sub }), { auth: true })
    .get("/admin", ({ user }) => ({ id: user.sub }), {
      auth: { roles: ["admin"] },
    })
    .get("/limited", () => ({ ok: true }), {
      auth: {
        rateLimit: { name: "test", limit: 1, windowSeconds: 60 },
      },
    });
}

describe("authPlugin", () => {
  test("menyediakan decorator jwt untuk route turunan", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/sign"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/^eyJ/);
  });

  test("menolak request tanpa token dengan 401", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/protected"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("menolak token yang tidak valid dengan 401", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/protected", {
        headers: { authorization: "Bearer token-palsu" },
      }),
    );

    expect(response.status).toBe(401);
  });

  test("route role juga menolak request tanpa token", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/admin"),
    );

    expect(response.status).toBe(401);
  });

  test("route dengan rate limit tetap memerlukan login", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/limited"),
    );

    expect(response.status).toBe(401);
  });
});
