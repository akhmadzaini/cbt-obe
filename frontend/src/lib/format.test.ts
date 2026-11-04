import { describe, expect, test } from "vitest";
import { ApiError } from "./api";
import {
  errorMessage,
  formatBytes,
  formatDate,
  formatDateTime,
  stripHtml,
} from "./format";

describe("formatBytes", () => {
  test("menampilkan tanda pisah untuk nilai kosong", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
  });

  test("menampilkan satuan byte untuk nilai kecil", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  test("mengonversi ke KB, MB, dan GB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10 * 1024)).toBe("10 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
  });
});

describe("stripHtml", () => {
  test("menghapus tag dan merapikan spasi", () => {
    expect(stripHtml("<p>Halo <strong>dunia</strong></p>")).toBe("Halo dunia");
  });

  test("menghasilkan string kosong untuk teks hanya tag", () => {
    expect(stripHtml("<br /><hr />")).toBe("");
  });

  test("mempertahankan teks biasa", () => {
    expect(stripHtml("  Soal   biasa  ")).toBe("Soal biasa");
  });
});

describe("formatDateTime", () => {
  test("mengembalikan tanda pisah untuk nilai kosong", () => {
    expect(formatDateTime(null)).toBe("-");
    expect(formatDateTime(undefined)).toBe("-");
    expect(formatDateTime("")).toBe("-");
  });

  test("mengembalikan nilai asli bila tanggal tidak valid", () => {
    expect(formatDateTime("bukan-tanggal")).toBe("bukan-tanggal");
  });

  test("memformat tanggal yang valid", () => {
    expect(formatDateTime("2026-01-02T03:04:05Z")).toContain("2026");
  });
});

describe("formatDate", () => {
  test("mengembalikan tanda pisah untuk nilai kosong", () => {
    expect(formatDate(null)).toBe("-");
  });

  test("mengembalikan nilai asli bila tanggal tidak valid", () => {
    expect(formatDate("bukan-tanggal")).toBe("bukan-tanggal");
  });

  test("memformat tanggal yang valid", () => {
    expect(formatDate("2026-01-02T03:04:05Z")).toContain("2026");
  });
});

describe("errorMessage", () => {
  test("mengambil pesan dari ApiError", () => {
    expect(errorMessage(new ApiError("Gagal memuat", 500))).toBe(
      "Gagal memuat",
    );
  });

  test("mengambil pesan dari Error biasa", () => {
    expect(errorMessage(new Error("Kesalahan"))).toBe("Kesalahan");
  });

  test("memakai pesan umum untuk nilai lain", () => {
    expect(errorMessage("string")).toBe("Terjadi kesalahan.");
    expect(errorMessage(null)).toBe("Terjadi kesalahan.");
  });
});
