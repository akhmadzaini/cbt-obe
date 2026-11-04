export const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export function validateUsername(value: string): string | null {
  if (value.length < 3 || value.length > 100) {
    return "Username harus 3-100 karakter.";
  }
  if (!USERNAME_PATTERN.test(value)) {
    return "Username hanya boleh berisi huruf, angka, titik, underscore, atau tanda hubung.";
  }
  return null;
}

export function validateFullName(value: string): string | null {
  if (!value) return "Nama lengkap wajib diisi.";
  if (value.length > 150) return "Nama lengkap maksimal 150 karakter.";
  return null;
}

export function validateNewPassword(value: string): string | null {
  if (value.length < 8 || value.length > 128) {
    return "Password harus 8-128 karakter.";
  }
  return null;
}
