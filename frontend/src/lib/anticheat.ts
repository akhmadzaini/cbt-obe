import html2canvas from "html2canvas";
import type { ViolationType } from "./types";

/** ID child <body> yang diizinkan (aplikasi React + portal overlay). */
export const WHITELISTED_BODY_CHILDREN = new Set(["root", "modal-root"]);

export const STRIKE_TYPES = new Set<ViolationType>([
  "tab_hidden",
  "window_blur",
  "fullscreen_exit",
  "dom_injection",
]);

type KeyboardLockApi = {
  lock?: (keys?: string[]) => Promise<void>;
  unlock?: () => void;
};

function getKeyboardLockApi(): KeyboardLockApi | null {
  const keyboard = (
    navigator as Navigator & { keyboard?: KeyboardLockApi }
  ).keyboard;
  if (!keyboard || typeof keyboard.lock !== "function") return null;
  return keyboard;
}

export function supportsKeyboardLock(): boolean {
  return Boolean(getKeyboardLockApi());
}

/**
 * Meminta browser menahan tombol Escape selama fullscreen. Di Chromium,
 * Escape harus ditahan sekitar dua detik untuk keluar. Browser lain atau
 * konteks non-secure akan menolak, sehingga fungsi ini bersifat best-effort.
 */
export async function lockKeyboard(): Promise<boolean> {
  if (!document.fullscreenElement) return false;

  const keyboard = getKeyboardLockApi();
  if (!keyboard?.lock) return false;

  try {
    await Promise.race([
      keyboard.lock(["Escape"]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("keyboard-lock-timeout")), 1500),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function unlockKeyboard(): void {
  const keyboard = getKeyboardLockApi();
  try {
    keyboard?.unlock?.();
  } catch {
    // ignore
  }
}

type FullscreenOptionsWithKeyboardLock = FullscreenOptions & {
  keyboardLock?: "none" | "browser";
};

async function requestFullscreenWithKeyboardLock(): Promise<void> {
  const element = document.documentElement;
  const options: FullscreenOptionsWithKeyboardLock = supportsKeyboardLock()
    ? { keyboardLock: "browser" }
    : {};

  try {
    await Promise.race([
      element.requestFullscreen(options),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("fullscreen-timeout")), 5000),
      ),
    ]);
  } catch (error) {
    const timedOut =
      error instanceof Error && error.message === "fullscreen-timeout";
    if (timedOut || options.keyboardLock === undefined) throw error;

    // Browser lama mungkin punya navigator.keyboard tetapi belum mendukung
    // opsi keyboardLock pada requestFullscreen(). Coba lagi tanpa opsi.
    await Promise.race([
      element.requestFullscreen(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("fullscreen-timeout")), 5000),
      ),
    ]);
  }
}

export async function enterFullscreen(): Promise<boolean> {
  try {
    if (!document.fullscreenElement) {
      // Sebagian browser menggantung promise ini jika izin fullscreen
      // diblokir; batasi agar UI tidak macet di "Menyiapkan...".
      await requestFullscreenWithKeyboardLock();
    }
    if (!document.fullscreenElement) return false;

    // Progressive enhancement: kunci Escape jika browser mendukung.
    await lockKeyboard();
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  unlockKeyboard();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // ignore
  }
}

export function isFullscreen(): boolean {
  return Boolean(document.fullscreenElement);
}

/**
 * Snapshot halaman ujian (#root). Overlay berada di #modal-root sehingga
 * tidak ikut tertangkap. Tidak memerlukan izin share-screen.
 */
export async function captureExamScreenshot(): Promise<Blob | null> {
  const target = document.getElementById("root");
  if (!target) return null;

  try {
    const canvas = await html2canvas(target, {
      backgroundColor: "#ffffff",
      scale: 0.5,
      logging: false,
      useCORS: true,
    });
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/png", 0.7),
    );
  } catch {
    return null;
  }
}

/**
 * MutationObserver hanya memantau direct children <body> (subtree: false).
 * Perubahan di dalam #root (Virtual DOM React) dan #modal-root diabaikan.
 */
export function installMutationGuard(
  onInjection: (element: HTMLElement, meta: Record<string, unknown>) => void,
  shouldIgnore?: () => boolean,
): () => void {
  const observer = new MutationObserver((mutations) => {
    if (shouldIgnore?.()) return;

    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.parentElement !== document.body) return;
        if (WHITELISTED_BODY_CHILDREN.has(node.id)) return;

        const meta = {
          tag: node.tagName,
          id: node.id || null,
          className:
            typeof node.className === "string" ? node.className : null,
        };

        try {
          node.remove();
        } catch {
          // ignore
        }

        onInjection(node, meta);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: false });
  return () => observer.disconnect();
}

type BlockedHandler = (
  type: "contextmenu" | "copy_paste" | "keyboard_shortcut",
  meta?: Record<string, unknown>,
) => void;

/**
 * Memblokir contextmenu, seleksi teks, copy/cut/paste, shortcut keyboard,
 * serta Escape selama fullscreen agar peserta tidak keluar dari ujian.
 */
export function installInteractionGuards(
  onBlocked: BlockedHandler,
): () => void {
  const preventDefault = (event: Event) => event.preventDefault();

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    onBlocked("contextmenu");
  };

  const onClipboard = (event: ClipboardEvent) => {
    event.preventDefault();
    onBlocked("copy_paste", { event: event.type });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const modifier = event.ctrlKey || event.metaKey;

    if (key === "escape" && document.fullscreenElement) {
      event.preventDefault();
      onBlocked("keyboard_shortcut", {
        key: event.key,
        reason: "fullscreen_escape",
      });
      return;
    }

    const blockedCombo =
      modifier && ["u", "s", "p", "c", "v", "x", "a"].includes(key);
    const devtools =
      key === "f12" ||
      (modifier && event.shiftKey && ["i", "j", "c"].includes(key));
    const printScreen = key === "printscreen";

    if (blockedCombo || devtools || printScreen) {
      event.preventDefault();
      onBlocked("keyboard_shortcut", { key: event.key });
    }
  };

  document.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("copy", onClipboard);
  document.addEventListener("cut", onClipboard);
  document.addEventListener("paste", onClipboard);
  document.addEventListener("selectstart", preventDefault);
  document.addEventListener("keydown", onKeyDown, true);

  return () => {
    document.removeEventListener("contextmenu", onContextMenu);
    document.removeEventListener("copy", onClipboard);
    document.removeEventListener("cut", onClipboard);
    document.removeEventListener("paste", onClipboard);
    document.removeEventListener("selectstart", preventDefault);
    document.removeEventListener("keydown", onKeyDown, true);
  };
}
