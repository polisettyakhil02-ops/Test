import type { ZodError } from "zod";

/** Flattens a ZodError into a single readable string for the ValidationError message shown to the caller. */
export function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}

/** Escapes regex metacharacters so user-supplied search text can be safely interpolated into a `new RegExp(...)` used in a MongoDB query — without this, a search term containing e.g. `.*` or `(` either throws or matches far more than intended. Always run untrusted input through this before building a query regex. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
