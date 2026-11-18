const TOKEN_KEY = "cbt_token";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`/api${path}`, {
    cache: "no-store",
    ...init,
    headers,
  });
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (response.status === 401) {
    clearToken();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
    throw new ApiError("Sesi berakhir. Silakan login kembali.", 401, data);
  }

  if (response.status === 429) {
    throw new ApiError(
      typeof data.error === "string"
        ? data.error
        : "Terlalu banyak permintaan. Coba lagi nanti.",
      429,
      data,
    );
  }

  if (!response.ok) {
    throw new ApiError(
      typeof data.error === "string" ? data.error : "Terjadi kesalahan.",
      response.status,
      data,
    );
  }

  return data as T;
}

export function apiForm<T>(
  path: string,
  form: FormData,
  init: RequestInit = {},
): Promise<T> {
  return api<T>(path, { ...init, method: "POST", body: form });
}

function filenameFromDisposition(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(value);
  if (!match || !match[1]) return fallback;
  try {
    return decodeURIComponent(match[1].trim());
  } catch {
    return match[1].trim();
  }
}

export async function apiDownload(
  path: string,
  fallbackFilename: string,
): Promise<void> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`/api${path}`, { cache: "no-store", headers });

  if (response.status === 401) {
    clearToken();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
    throw new ApiError("Sesi berakhir. Silakan login kembali.", 401);
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (response.status === 429) {
      throw new ApiError(
        typeof data.error === "string"
          ? data.error
          : "Terlalu banyak permintaan. Coba lagi nanti.",
        429,
        data,
      );
    }
    throw new ApiError(
      typeof data.error === "string" ? data.error : "Gagal mengunduh file.",
      response.status,
      data,
    );
  }

  const blob = await response.blob();
  const filename = filenameFromDisposition(
    response.headers.get("content-disposition"),
    fallbackFilename,
  );
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
