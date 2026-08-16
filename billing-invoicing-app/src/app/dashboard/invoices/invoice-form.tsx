'use client'

import Link from 'next/link'
import { useActionState, useId, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react'
import { createInvoice, updateInvoice } from '@/app/dashboard/invoices/actions'
import { emptyFormState, type FormState } from '@/lib/form-state'
import { recalculateInvoice, taxBreakdown, type DiscountType } from '@/lib/invoice-math'
import { formatCurrency, INVOICE_STATUS_LABELS, type ClientDTO, type ItemDTO, type InvoiceDTO } from '@/lib/dto'
import { Field, TextareaField } from '@/components/field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface EditableLine {
  key: string
  item: string | null
  description: string
  hsnSac: string
  unit: string
  quantity: string
  unitPrice: string
  taxRate: string
}

const BLANK_LINE_FIELDS: Omit<EditableLine, 'key'> = {
  item: null,
  description: '',
  hsnSac: '',
  unit: 'unit',
  quantity: '1',
  unitPrice: '0',
  taxRate: '0',
}

/** One past the highest key currently in use, so keys are never reused. */
function nextKeyFor(lines: EditableLine[]): string {
  const highest = lines.reduce((max, line) => {
    const n = Number(line.key.replace('line-', ''))
    return Number.isFinite(n) ? Math.max(max, n) : max
  }, -1)
  return `line-${highest + 1}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

/** Text inputs are the source of truth while typing; "" and "1.5" both occur. */
function num(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? 'Saving...' : label}
    </Button>
  )
}

interface InvoiceFormProps {
  clients: ClientDTO[]
  items: ItemDTO[]
  invoice?: InvoiceDTO
}

export function InvoiceForm({ clients, items, invoice }: InvoiceFormProps) {
  const isEdit = Boolean(invoice)

  const action = isEdit
    ? updateInvoice.bind(null, invoice!.id)
    : (createInvoice as (state: FormState, formData: FormData) => Promise<FormState>)

  const [state, formAction] = useActionState(action, emptyFormState)
  const errors = state.fieldErrors

  // DOM ids come from useId() plus the row index: deterministic on both server
  // and client, which is what label/input association needs. React keys are a
  // separate concern below -- they are never rendered, so they cannot cause a
  // hydration mismatch.
  const idBase = useId()

  const [clientId, setClientId] = useState(invoice?.clientId ?? '')
  const [status, setStatus] = useState(invoice?.status ?? 'draft')
  const [discountType, setDiscountType] = useState<DiscountType>(
    invoice?.discountType ?? 'fixed',
  )
  const [discountValue, setDiscountValue] = useState(String(invoice?.discountValue ?? 0))
  const [amountPaid, setAmountPaid] = useState(String(invoice?.amountPaid ?? 0))
  const [lines, setLines] = useState<EditableLine[]>(() =>
    invoice && invoice.lineItems.length > 0
      ? invoice.lineItems.map((line, index) => ({
          key: `line-${index}`,
          item: line.itemId,
          description: line.description,
          hsnSac: line.hsnSac,
          unit: line.unit,
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice),
          taxRate: String(line.taxRate),
        }))
      : [{ key: 'line-0', ...BLANK_LINE_FIELDS }],
  )

  /**
   * Appends a row, deriving its key from the rows that already exist. Doing
   * this inside the updater keeps it pure -- a module-level or ref-held counter
   * would either drift between server and client or be read during render.
   */
  function appendLine(fields: Omit<EditableLine, 'key'>) {
    setLines((current) => [...current, { key: nextKeyFor(current), ...fields }])
  }

  // Exactly the arithmetic the server will apply on save -- same module.
  const totals = useMemo(() => {
    const calc = recalculateInvoice({
      lineItems: lines.map((line) => ({
        quantity: num(line.quantity),
        unitPrice: num(line.unitPrice),
        taxRate: num(line.taxRate),
        lineSubtotal: 0,
        lineDiscount: 0,
        lineTaxAmount: 0,
        lineTotal: 0,
      })),
      discountType,
      discountValue: num(discountValue),
      amountPaid: num(amountPaid),
    })

    return { ...calc, breakdown: taxBreakdown(calc.lineItems) }
  }, [lines, discountType, discountValue, amountPaid])

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    )
  }

  function addLineFromItem(itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId)
    if (!item) return

    // Snapshot the item's values into the line. From here the line is
    // independent -- later edits to the item do not reach back into it.
    appendLine({
      item: item.id,
      description: item.description || item.name,
      hsnSac: item.hsnSac,
      unit: item.unit,
      quantity: '1',
      unitPrice: String(item.price),
      taxRate: String(item.taxRate),
    })
  }

  const serializedLines = JSON.stringify(
    lines.map((line) => ({
      item: line.item,
      description: line.description,
      hsnSac: line.hsnSac,
      unit: line.unit,
      quantity: num(line.quantity),
      unitPrice: num(line.unitPrice),
      taxRate: num(line.taxRate),
    })),
  )

  const lineItemError =
    errors.lineItems ??
    Object.entries(errors).find(([key]) => key.startsWith('lineItems.'))?.[1]

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="lineItems" value={serializedLines} />
      <input type="hidden" name="client" value={clientId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="discountType" value={discountType} />

      <Card>
        <CardHeader>
          <CardTitle>Invoice details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="client-trigger">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger
                id="client-trigger"
                aria-invalid={errors.client ? true : undefined}
              >
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.client ? (
              <p className="text-destructive text-xs">{errors.client}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="status-trigger">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger id="status-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Adjusted to match the balance on save.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <Field
              name="issueDate"
              label="Issue date"
              type="date"
              defaultValue={invoice?.issueDate || today()}
              error={errors.issueDate}
              required
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <Field
              name="dueDate"
              label="Due date"
              type="date"
              defaultValue={invoice?.dueDate}
              error={errors.dueDate}
              hint="Optional."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Line items</CardTitle>
          {items.length > 0 ? (
            <div className="w-56">
              <Select value="" onValueChange={addLineFromItem}>
                <SelectTrigger aria-label="Add a saved item">
                  <SelectValue placeholder="Add from items..." />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} — {formatCurrency(item.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {lines.map((line, index) => {
            const computed = totals.lineItems[index]
            const rowId = `${idBase}-row${index}`

            return (
              <div
                key={line.key}
                className="grid gap-3 rounded-lg border p-4 sm:grid-cols-12"
              >
                <div className="flex flex-col gap-2 sm:col-span-12 lg:col-span-4">
                  <Label htmlFor={`${rowId}-description`}>Description</Label>
                  <Input
                    id={`${rowId}-description`}
                    value={line.description}
                    onChange={(event) =>
                      updateLine(line.key, { description: event.target.value })
                    }
                    placeholder="What are you billing for?"
                  />
                </div>

                <div className="flex flex-col gap-2 sm:col-span-4 lg:col-span-2">
                  <Label htmlFor={`${rowId}-hsn`}>HSN / SAC</Label>
                  <Input
                    id={`${rowId}-hsn`}
                    value={line.hsnSac}
                    onChange={(event) =>
                      updateLine(line.key, { hsnSac: event.target.value })
                    }
                  />
                </div>

                <div className="flex flex-col gap-2 sm:col-span-4 lg:col-span-1">
                  <Label htmlFor={`${rowId}-qty`}>Qty</Label>
                  <Input
                    id={`${rowId}-qty`}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(line.key, { quantity: event.target.value })
                    }
                  />
                </div>

                <div className="flex flex-col gap-2 sm:col-span-4 lg:col-span-2">
                  <Label htmlFor={`${rowId}-price`}>Rate</Label>
                  <Input
                    id={`${rowId}-price`}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={line.unitPrice}
                    onChange={(event) =>
                      updateLine(line.key, { unitPrice: event.target.value })
                    }
                  />
                </div>

                <div className="flex flex-col gap-2 sm:col-span-4 lg:col-span-1">
                  <Label htmlFor={`${rowId}-tax`}>Tax %</Label>
                  <Input
                    id={`${rowId}-tax`}
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    inputMode="decimal"
                    value={line.taxRate}
                    onChange={(event) =>
                      updateLine(line.key, { taxRate: event.target.value })
                    }
                  />
                </div>

                <div className="flex items-end justify-between gap-2 sm:col-span-8 lg:col-span-2">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Line total</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(computed?.lineTotal ?? 0)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove line ${index + 1}`}
                    className="text-muted-foreground hover:text-destructive"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((candidate) => candidate.key !== line.key),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            )
          })}

          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => appendLine(BLANK_LINE_FIELDS)}
            >
              <Plus />
              Add line
            </Button>
          </div>

          {lineItemError ? (
            <p className="text-destructive text-xs">{lineItemError}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Discount &amp; payment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="discount-type-trigger">Discount type</Label>
              <Select
                value={discountType}
                onValueChange={(value) => setDiscountType(value as DiscountType)}
              >
                <SelectTrigger id="discount-type-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="discountValue">
                Discount {discountType === 'percentage' ? '(%)' : '(amount)'}
              </Label>
              <Input
                id="discountValue"
                name="discountValue"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
                aria-invalid={errors.discountValue ? true : undefined}
              />
              {errors.discountValue ? (
                <p className="text-destructive text-xs">{errors.discountValue}</p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Applied before tax and split across lines.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="amountPaid">Amount paid</Label>
              <Input
                id="amountPaid"
                name="amountPaid"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={amountPaid}
                onChange={(event) => setAmountPaid(event.target.value)}
                aria-invalid={errors.amountPaid ? true : undefined}
              />
              {errors.amountPaid ? (
                <p className="text-destructive text-xs">{errors.amountPaid}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatCurrency(totals.subtotal)}</span>
            </div>
            {totals.discountAmount > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="tabular-nums">
                  −{formatCurrency(totals.discountAmount)}
                </span>
              </div>
            ) : null}
            {totals.breakdown
              .filter((row) => row.rate > 0)
              .map((row) => (
                <div key={row.rate} className="flex justify-between">
                  <span className="text-muted-foreground">
                    Tax @ {row.rate}% on {formatCurrency(row.taxable)}
                  </span>
                  <span className="tabular-nums">{formatCurrency(row.tax)}</span>
                </div>
              ))}
            <div className="mt-2 flex justify-between border-t pt-3 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(totals.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span className="tabular-nums">{formatCurrency(num(amountPaid))}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Balance due</span>
              <span className="tabular-nums">{formatCurrency(totals.amountDue)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notes &amp; terms</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextareaField
            name="notes"
            label="Notes"
            defaultValue={invoice?.notes}
            error={errors.notes}
            placeholder="Shown on the invoice."
            rows={3}
          />
          <TextareaField
            name="terms"
            label="Terms"
            defaultValue={invoice?.terms}
            error={errors.terms}
            placeholder="Payment terms, bank details, etc."
            rows={3}
          />
        </CardContent>
      </Card>

      {state.error ? (
        <p role="alert" className="text-destructive flex items-center gap-2 text-sm">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton label={isEdit ? 'Save changes' : 'Create invoice'} />
        <Button asChild variant="ghost">
          <Link href={isEdit ? `/dashboard/invoices/${invoice!.id}` : '/dashboard/invoices'}>
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  )
}
