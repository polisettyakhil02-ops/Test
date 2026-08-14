import { z } from 'zod'

/**
 * Turns "" into undefined before validating, so an empty optional input does
 * not trip a format check (an untouched email box must not fail `.email()`).
 */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? '')

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? '')
  .refine((value) => value === '' || z.email().safeParse(value).success, {
    message: 'Enter a valid email address, or leave it blank',
  })

// HTML number inputs arrive as strings, so coerce. Note `error` (not zod 3's
// `invalid_type_error`) is what carries a custom message in zod 4, and
// `.finite()` is what actually rejects a non-numeric string: coercion turns
// "abc" into NaN rather than failing outright.
const money = z.coerce
  .number({ error: 'Enter a valid number' })
  .finite('Enter a valid number')
  .min(0, 'Cannot be negative')

export const clientSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: optionalEmail,
  phone: optionalText,
  gstin: optionalText,
  notes: optionalText,
  billingAddress: z.object({
    line1: optionalText,
    line2: optionalText,
    city: optionalText,
    state: optionalText,
    postalCode: optionalText,
    country: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : 'India')),
  }),
})

export type ClientInput = z.infer<typeof clientSchema>

export const itemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: optionalText,
  hsnSac: optionalText,
  unit: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : 'unit')),
  price: money,
  taxRate: z.coerce
    .number({ error: 'Enter a valid number' })
    .finite('Enter a valid number')
    .min(0, 'Cannot be negative')
    .max(100, 'Cannot exceed 100'),
})

export type ItemInput = z.infer<typeof itemSchema>

/** Flattens a ZodError into { fieldPath: firstMessage } for form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {}

  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (!(path in result)) {
      result[path] = issue.message
    }
  }

  return result
}
