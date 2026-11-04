/**
 * Helper untuk mengenali error MySQL/MariaDB yang umum ditangani route.
 */
function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function isDuplicateEntry(error: unknown): boolean {
  return errorCode(error) === "ER_DUP_ENTRY";
}

export function isRowReferencedError(error: unknown): boolean {
  const code = errorCode(error);
  return code === "ER_ROW_IS_REFERENCED_2" || code === "ER_ROW_IS_REFERENCED";
}
