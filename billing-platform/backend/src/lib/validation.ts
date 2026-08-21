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
 * A decimal kept as a string all the way to the domain layer.
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
const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address'),
  password: z.string().min(1, 'Enter your password'),
})

export const partySchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: optionalEmail,
  phone: optionalText,
  gstin: optionalText.transform((v) => v.toUpperCase()),
  stateCode: optionalText,
  notes: optionalText,
  billingAddress: z
    .object({
      line1: optionalText,
      line2: optionalText,
      city: optionalText,
      state: optionalText,
      postalCode: optionalText,
      country: z.string().trim().optional().transform((v) => v || 'India'),
    })
    .default({ line1: '', line2: '', city: '', state: '', postalCode: '', country: 'India' }),
})

export const itemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: optionalText,
  hsnSac: optionalText,
  unit: z.string().trim().optional().transform((v) => v || 'unit'),
  unitPrice: amountString,
  taxRatePercent: percentString,
})

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
    docType: z.enum(['invoice', 'credit_note']).default('invoice'),
    correctsDocumentId: uuidString.nullable().optional().default(null),
    partyId: uuidString,
    issueDate: dateOnly,
    dueDate: dateOnly.optional().or(z.literal('')).nullable().transform((v) => v || ''),
    lines: z.array(invoiceLineSchema).min(1, 'Add at least one line'),
    discountType: z.enum(['percentage', 'fixed']).default('fixed'),
    discountValue: amountString.default('0'),
    notes: optionalText,
    terms: optionalText,
  })
  .refine((v) => v.discountType !== 'percentage' || Number(v.discountValue) <= 100, {
    message: 'A percentage discount cannot exceed 100',
    path: ['discountValue'],
  })
  .refine((v) => !v.dueDate || v.dueDate >= v.issueDate, {
    message: 'Due date cannot be before the issue date',
    path: ['dueDate'],
  })

export const paymentSchema = z.object({
  partyId: uuidString,
  issueDate: dateOnly,
  amount: amountString.refine((v) => Number(v) > 0, {
    message: 'Enter an amount greater than zero',
  }),
  reference: optionalText,
  allocations: z.array(z.object({ documentId: uuidString, amount: amountString })).default([]),
})

/**
 * What an IRP hands back after registering an invoice. The IRN is a
 * 64-character SHA-256 digest; checking the shape catches a mis-paste before it
 * is stamped onto a document that can never be edited again.
 */
export const irnSchema = z.object({
  irn: z.string().trim().regex(/^[0-9a-f]{64}$/i, 'An IRN is 64 hexadecimal characters'),
  ackNo: z.string().trim().min(1, 'Enter the acknowledgement number'),
  ackDate: z.string().trim().min(1, 'Enter the acknowledgement date'),
  signedQrCode: z.string().trim().min(1, 'Paste the signed QR string'),
})

export const periodSchema = z.object({
  from: dateOnly,
  to: dateOnly,
})

export type PartyInput = z.infer<typeof partySchema>
export type ItemInput = z.infer<typeof itemSchema>
export type InvoiceInput = z.infer<typeof invoiceSchema>
export type PaymentInput = z.infer<typeof paymentSchema>
