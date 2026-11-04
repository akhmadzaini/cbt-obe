import ExcelJS from "exceljs";

export const MAX_IMPORT_ROWS = 1000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const TEMPLATE_FILENAME = "template-import-peserta.xlsx";

export const USERNAME_ALIASES = new Set(["username", "user", "userid", "idpeserta"]);
export const FULLNAME_ALIASES = new Set([
  "fullname",
  "namalengkap",
  "nama",
  "name",
]);
export const PASSWORD_ALIASES = new Set(["password", "katasandi", "pass"]);
export const ACTIVE_ALIASES = new Set([
  "isactive",
  "aktif",
  "statusaktif",
  "aktifyatidak",
]);

export function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findColumn(
  headers: Map<string, number>,
  aliases: Set<string>,
): number | undefined {
  for (const [header, column] of headers) {
    if (aliases.has(header)) return column;
  }
  return undefined;
}

export function cellText(row: ExcelJS.Row, column: number | undefined): string {
  if (!column) return "";
  return row.getCell(column).text.trim();
}

export function parseActive(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (["ya", "y", "true", "1", "aktif", "active"].includes(normalized)) {
    return true;
  }
  if (
    ["tidak", "t", "false", "0", "nonaktif", "inactive"].includes(normalized)
  ) {
    return false;
  }
  return null;
}

export async function buildTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CBT";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Peserta", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Username", key: "username", width: 26 },
    { header: "Nama Lengkap", key: "fullName", width: 34 },
    { header: "Password", key: "password", width: 24 },
    { header: "Aktif (Ya/Tidak)", key: "isActive", width: 18 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2F56D4" },
  };
  header.alignment = { vertical: "middle" };
  header.height = 24;

  sheet.addRow({
    username: "siswa001",
    fullName: "Budi Santoso",
    password: "rahasia123",
    isActive: "Ya",
  });
  sheet.addRow({
    username: "siswa002",
    fullName: "Siti Aminah",
    password: "rahasia123",
    isActive: "Ya",
  });

  sheet.getColumn(1).numFmt = "@";
  sheet.getColumn(3).numFmt = "@";
  sheet.autoFilter = { from: "A1", to: "D1" };

  for (let rowNumber = 2; rowNumber <= MAX_IMPORT_ROWS + 1; rowNumber++) {
    sheet.getCell(`D${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Ya,Tidak"'],
      showErrorMessage: true,
      errorTitle: "Nilai tidak valid",
      error: "Pilih Ya atau Tidak.",
    };
  }

  const guide = workbook.addWorksheet("Petunjuk");
  guide.columns = [{ width: 24 }, { width: 96 }];
  guide.addRows([
    ["Kolom", "Keterangan"],
    [
      "Username",
      "Wajib. Unik, 3-100 karakter, tanpa spasi. Contoh: siswa001 atau NISN.",
    ],
    ["Nama Lengkap", "Wajib. Maksimal 150 karakter."],
    [
      "Password",
      "Wajib. Minimal 8 karakter. Password akan di-hash saat import.",
    ],
    ["Aktif (Ya/Tidak)", "Opsional. Kosong dianggap Ya."],
    [],
    ["Catatan", "Import hanya membuat akun peserta (role student)."],
    [
      "",
      "Username yang sudah ada akan dilewati dan dilaporkan, kecuali memilih mode perbarui.",
    ],
    ["", "Baris contoh boleh dihapus sebelum file di-import."],
  ]);
  guide.getRow(1).font = { bold: true };
  guide.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  guide.eachRow((row) => {
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

export async function hashPasswords(
  passwords: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(passwords)];
  const hashes = new Map<string, string>();
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(8, Math.max(1, unique.length)) },
    async () => {
      while (cursor < unique.length) {
        const password = unique[cursor]!;
        cursor += 1;
        hashes.set(password, await Bun.password.hash(password));
      }
    },
  );
  await Promise.all(workers);
  return hashes;
}

