export const VIOLATION_TYPES = new Set([
  "tab_hidden",
  "window_blur",
  "fullscreen_exit",
  "dom_injection",
  "contextmenu",
  "copy_paste",
  "keyboard_shortcut",
]);

/**
 * Hanya pelanggaran berat yang menambah strike & menjeda timer.
 * Pemblokiran interaksi (klik kanan, copy/paste, shortcut) tetap dicatat
 * sebagai log tetapi tidak dihitung sebagai strike.
 */
export const STRIKE_TYPES = new Set([
  "tab_hidden",
  "window_blur",
  "fullscreen_exit",
  "dom_injection",
]);

export type ViolationType =
  | "tab_hidden"
  | "window_blur"
  | "fullscreen_exit"
  | "dom_injection"
  | "contextmenu"
  | "copy_paste"
  | "keyboard_shortcut";
