import { describe, expect, test } from "bun:test";
import { canManageQuestion, canViewQuestion } from "./access";
import type { AuthUser } from "./auth";

const admin: AuthUser = { sub: "admin-1", role: "admin", ua: "test" };
const teacherA: AuthUser = { sub: "teacher-a", role: "teacher", ua: "test" };
const teacherB: AuthUser = { sub: "teacher-b", role: "teacher", ua: "test" };

describe("kepemilikan bank soal", () => {
  test("admin dapat melihat dan mengubah semua soal", () => {
    expect(canViewQuestion(null, admin)).toBe(true);
    expect(canViewQuestion("teacher-a", admin)).toBe(true);
    expect(canManageQuestion("teacher-a", admin)).toBe(true);
  });

  test("guru melihat bank bersama tetapi tidak dapat mengubahnya", () => {
    expect(canViewQuestion(null, teacherA)).toBe(true);
    expect(canManageQuestion(null, teacherA)).toBe(false);
  });

  test("guru hanya mengelola soal miliknya sendiri", () => {
    expect(canViewQuestion("teacher-a", teacherA)).toBe(true);
    expect(canManageQuestion("teacher-a", teacherA)).toBe(true);

    expect(canViewQuestion("teacher-b", teacherA)).toBe(false);
    expect(canManageQuestion("teacher-b", teacherA)).toBe(false);
    expect(canViewQuestion("teacher-b", teacherB)).toBe(true);
  });
});
