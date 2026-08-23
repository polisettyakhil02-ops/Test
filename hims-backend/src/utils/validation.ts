import type { ZodError } from "zod";

/** Flattens a ZodError into a single readable string for the ValidationError message shown to the caller. */
export function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
