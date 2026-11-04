export function examStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "published":
      return "Published";
    case "archived":
      return "Arsip";
    default:
      return status;
  }
}

export function sessionStatusLabel(status: string): string {
  switch (status) {
    case "started":
      return "Dimulai";
    case "in_progress":
      return "Sedang berjalan";
    case "finished":
      return "Selesai";
    case "suspended":
      return "Ditangguhkan";
    default:
      return status;
  }
}

export function gradingStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Menunggu";
    case "partial":
      return "Sebagian";
    case "completed":
      return "Lengkap";
    default:
      return status;
  }
}

export function violationTypeLabel(type: string): string {
  switch (type) {
    case "tab_hidden":
      return "Tab tidak aktif";
    case "window_blur":
      return "Jendela keluar fokus";
    case "fullscreen_exit":
      return "Keluar layar penuh";
    case "dom_injection":
      return "Upaya injeksi";
    case "contextmenu":
      return "Klik kanan";
    case "copy_paste":
      return "Salin/tempel";
    case "keyboard_shortcut":
      return "Pintasan keyboard";
    default:
      return type;
  }
}
