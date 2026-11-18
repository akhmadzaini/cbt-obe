import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./api";

const store = new Map<string, string>();

function stubBrowser() {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  });
  vi.stubGlobal("window", {
    location: {
      pathname: "/login",
      assign: vi.fn(),
    },
  });
}

describe("api 401 handling", () => {
  beforeEach(() => {
    store.clear();
    stubBrowser();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("login memakai pesan error dari server, bukan pesan sesi berakhir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: "Username atau password salah." }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(
      api("/auth/login", { method: "POST" }, { allowUnauthorized: true }),
    ).rejects.toThrow("Username atau password salah.");
  });

  test("401 pada endpoint terproteksi tetap dianggap sesi berakhir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(api("/exams")).rejects.toThrow(
      "Sesi berakhir. Silakan login kembali.",
    );
  });
});
