import { z } from 'zod'

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? '')

const optionalEmail = optionalText.refine(
  (value) => value === '' || z.email().safeParse(value).success,
  { message: 'Enter a valid email address, or leave it blank' },
)

/**
 * A decimal string kept as a string all the way to the database.
 *
 * Parsing to a JS number here would reintroduce exactly the float problem the
 * minor-unit representation removes; `domain/money` converts to integers.
 */
function decimalString(options: { min?: number; max?: number; label: string }) {
  return z
    .string()
    .trim()
    .refine((value) => /^\d*(\.\d+)?$/.test(value) && value !== '' && value !== '.', {
      message: `Enter a valid ${options.label}`,
    })
    .refine((value) => options.min === undefined || Number(value) >= options.min, {
      message: `${options.label} cannot be below ${options.min}`,
    })
    .refine((value) => options.max === undefined || Number(value) <= options.max, {
      message: `${options.label} cannot exceed ${options.max}`,
    })
}

export const amountString = decimalString({ min: 0, label: 'amount' })
export const percentString = decimalString({ min: 0, max: 100, label: 'percentage' })
export const quantityString = decimalString({ min: 0, label: 'quantity' })

const uuidString = z.string().trim().uuid('Select a valid option')

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')

export const partySchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: optionalEmail,
  phone: optionalText,
  gstin: optionalText,
  stateCode: optionalText,
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

export type PartyInput = z.infer<typeof partySchema>

export const itemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: optionalText,
  hsnSac: optionalText,
  unit: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : 'unit')),
  unitPrice: amountString,
  taxRatePercent: percentString,
})

export type ItemInput = z.infer<typeof itemSchema>

export const invoiceLineSchema = z.object({
  itemId: uuidString.nullable().optional().default(null),
  description: z.string().trim().min(1, 'Description is required'),
  hsnSac: optionalText,
  unit: optionalText,
  quantity: quantityString.refine((v) => Number(v) > 0, {
    message: 'Quantity must be greater than zero',
  }),
  unitPrice: amountString,
  taxRatePercent: percentString,
})

export const invoiceSchema = z
  .object({
    partyId: uuidString,
    issueDate: dateOnly,
    dueDate: dateOnly.optional().or(z.literal('')).transform((v) => v || ''),
    lines: z.array(invoiceLineSchema).min(1, 'Add at least one line'),
    discountType: z.enum(['percentage', 'fixed']),
    discountValue: amountString,
    notes: optionalText,
    terms: optionalText,
  })
  .refine(
    (v) => v.discountType !== 'percentage' || Number(v.discountValue) <= 100,
    { message: 'A percentage discount cannot exceed 100', path: ['discountValue'] },
  )
  .refine((v) => !v.dueDate || v.dueDate >= v.issueDate, {
    message: 'Due date cannot be before the issue date',
    path: ['dueDate'],
  })

export type InvoiceInput = z.infer<typeof invoiceSchema>

export const paymentSchema = z.object({
  partyId: uuidString,
  issueDate: dateOnly,
  amount: amountString.refine((v) => Number(v) > 0, {
    message: 'Enter an amount greater than zero',
  }),
  reference: optionalText,
  allocations: z
    .array(z.object({ documentId: uuidString, amount: amountString }))
    .default([]),
})

export type PaymentInput = z.infer<typeof paymentSchema>

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (!(path in result)) result[path] = issue.message
  }
  return result
}
