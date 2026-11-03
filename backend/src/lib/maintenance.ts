/**
 * Penanda mode pemeliharaan global (satu instance backend).
 *
 * Dipakai saat restore berjalan agar tidak ada penulisan baru ke database atau
 * upload selama proses berlangsung. Endpoint kesehatan, login, dan seluruh
 * endpoint `/api/system/*` tetap diizinkan.
 */
type MaintenanceState = {
  active: boolean;
  message: string;
};

const state: MaintenanceState = {
  active: false,
  message: "",
};

export function enterMaintenance(
  message = "Sistem sedang dalam pemeliharaan. Coba lagi beberapa saat lagi.",
): void {
  state.active = true;
  state.message = message;
}

export function exitMaintenance(): void {
  state.active = false;
  state.message = "";
}

export function isMaintenance(): boolean {
  return state.active;
}

export function maintenanceMessage(): string {
  return state.message;
}
