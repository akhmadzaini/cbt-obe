import { describe, expect, test } from "bun:test";
import { remainingSeconds, shuffle } from "./session-service";

describe("remainingSeconds", () => {
  test("menghitung sisa detik dari deadline di masa depan", () => {
    const deadline = new Date(Date.now() + 60_000);
    expect(remainingSeconds(deadline)).toBeGreaterThanOrEqual(59);
    expect(remainingSeconds(deadline)).toBeLessThanOrEqual(60);
  });

  test("menerima deadline dalam bentuk string ISO", () => {
    const deadline = new Date(Date.now() + 30_000).toISOString();
    expect(remainingSeconds(deadline)).toBeGreaterThanOrEqual(29);
    expect(remainingSeconds(deadline)).toBeLessThanOrEqual(30);
  });

  test("mengembalikan 0 untuk deadline yang sudah lewat", () => {
    expect(remainingSeconds(new Date(Date.now() - 10_000))).toBe(0);
  });
});

describe("shuffle", () => {
  const items = Array.from({ length: 20 }, (_, index) => index);

  test("deterministik untuk seed yang sama", () => {
    expect(shuffle(items, "sesi-1")).toEqual(shuffle(items, "sesi-1"));
  });

  test("mengembalikan permutasi tanpa menghilangkan item", () => {
    const result = shuffle(items, "sesi-1");
    expect([...result].sort((a, b) => a - b)).toEqual(items);
  });

  test("tidak mengubah array asli", () => {
    const source = [1, 2, 3, 4, 5];
    shuffle(source, "sesi-1");
    expect(source).toEqual([1, 2, 3, 4, 5]);
  });

  test("menghasilkan urutan berbeda untuk seed berbeda", () => {
    expect(shuffle(items, "sesi-1")).not.toEqual(shuffle(items, "sesi-2"));
  });

  test("stabil untuk seed yang sama walau dipanggil ulang", () => {
    const first = shuffle(items, "ujian-abc");
    const second = shuffle(items, "ujian-abc");
    expect(first).toEqual(second);
  });
});
