import { parseAiken } from "./aiken";
import { parseGift } from "./gift";
import type { ParseResult } from "./types";

export * from "./types";

export function parseQuestions(
  format: "aiken" | "gift",
  content: string,
): ParseResult {
  return format === "aiken" ? parseAiken(content) : parseGift(content);
}
