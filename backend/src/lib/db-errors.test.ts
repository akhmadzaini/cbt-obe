import { describe, expect, test } from "bun:test";
import { isDuplicateEntry, isRowReferencedError } from "./db-errors";

describe("isDuplicateEntry", () => {
  test("mengenali error duplicate entry MySQL", () => {
    expect(isDuplicateEntry({ code: "ER_DUP_ENTRY" })).toBe(true);
  });

  test("menolak kode error lain", () => {
    expect(isDuplicateEntry({ code: "ER_ROW_IS_REFERENCED_2" })).toBe(false);
    expect(isDuplicateEntry({ code: 1062 })).toBe(false);
  });

  test("aman untuk nilai bukan objek", () => {
    expect(isDuplicateEntry(null)).toBe(false);
    expect(isDuplicateEntry(undefined)).toBe(false);
    expect(isDuplicateEntry("ER_DUP_ENTRY")).toBe(false);
    expect(isDuplicateEntry(new Error("gagal"))).toBe(false);
  });
});

describe("isRowReferencedError", () => {
  test("mengenali kedua kode foreign key MySQL", () => {
    expect(isRowReferencedError({ code: "ER_ROW_IS_REFERENCED_2" })).toBe(true);
    expect(isRowReferencedError({ code: "ER_ROW_IS_REFERENCED" })).toBe(true);
  });

  test("menolak kode error lain", () => {
    expect(isRowReferencedError({ code: "ER_DUP_ENTRY" })).toBe(false);
    expect(isRowReferencedError({})).toBe(false);
    expect(isRowReferencedError(null)).toBe(false);
  });
});
