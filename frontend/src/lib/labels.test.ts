import { describe, expect, test } from "vitest";
import {
  examStatusLabel,
  gradingStatusLabel,
  sessionStatusLabel,
  violationTypeLabel,
} from "./labels";

describe("examStatusLabel", () => {
  test("menerjemahkan status ujian", () => {
    expect(examStatusLabel("draft")).toBe("Draft");
    expect(examStatusLabel("published")).toBe("Published");
    expect(examStatusLabel("archived")).toBe("Arsip");
  });

  test("mengembalikan status asli bila tidak dikenal", () => {
    expect(examStatusLabel("lainnya")).toBe("lainnya");
  });
});

describe("sessionStatusLabel", () => {
  test("menerjemahkan status sesi", () => {
    expect(sessionStatusLabel("started")).toBe("Dimulai");
    expect(sessionStatusLabel("in_progress")).toBe("Sedang berjalan");
    expect(sessionStatusLabel("finished")).toBe("Selesai");
    expect(sessionStatusLabel("suspended")).toBe("Ditangguhkan");
  });

  test("mengembalikan status asli bila tidak dikenal", () => {
    expect(sessionStatusLabel("lainnya")).toBe("lainnya");
  });
});

describe("gradingStatusLabel", () => {
  test("menerjemahkan status penilaian", () => {
    expect(gradingStatusLabel("pending")).toBe("Menunggu");
    expect(gradingStatusLabel("partial")).toBe("Sebagian");
    expect(gradingStatusLabel("completed")).toBe("Lengkap");
  });

  test("mengembalikan status asli bila tidak dikenal", () => {
    expect(gradingStatusLabel("lainnya")).toBe("lainnya");
  });
});

describe("violationTypeLabel", () => {
  test("menerjemahkan tipe pelanggaran", () => {
    expect(violationTypeLabel("tab_hidden")).toBe("Tab tidak aktif");
    expect(violationTypeLabel("window_blur")).toBe("Jendela keluar fokus");
    expect(violationTypeLabel("fullscreen_exit")).toBe("Keluar layar penuh");
    expect(violationTypeLabel("dom_injection")).toBe("Upaya injeksi");
    expect(violationTypeLabel("contextmenu")).toBe("Klik kanan");
    expect(violationTypeLabel("copy_paste")).toBe("Salin/tempel");
    expect(violationTypeLabel("keyboard_shortcut")).toBe("Pintasan keyboard");
  });

  test("mengembalikan tipe asli bila tidak dikenal", () => {
    expect(violationTypeLabel("lainnya")).toBe("lainnya");
  });
});
