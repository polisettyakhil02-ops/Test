'use client'

import Link from 'next/link'
import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react'
import { createInvoice, updateInvoice } from '@/app/dashboard/invoices/actions'
import { emptyFormState, type FormState } from '@/lib/form-state'
import { priceDocument, resolveSupplyKind, taxSummary, type DiscountType } from '@/domain/pricing'
import { formatMinor, parseMinor } from '@/domain/money'
import { formatMoney, stateName, today } from '@/lib/dto'
import { Field, TextareaField } from '@/components/field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface FormParty {
  id: string
  name: string
  stateCode: string
}

export interface FormItem {
  id: string
  name: string
  description: string
  hsnSac: string
  unit: string
  unitPriceMinor: number
  defaultTaxRatePercent: string
}

export interface FormDocument {
  /** Empty when this is a prefill (e.g. a credit note seeded from an invoice). */
  id: string
  docType: string
  partyId: string
  issueDate: string
  dueDate: string | null
  discountType: string
  discountValue: string
  notes: string
  terms: string
  lines: Array<{
    itemId: string | null
    description: string
    hsnSac: string
    unit: string
    quantity: string
    unitPriceMinor: number
    taxRatePercent: string
  }>
}

interface EditableLine {
  key: string
  itemId: string | null
  description: string
  hsnSac: string
  unit: string
  quantity: string
  unitPrice: string
  taxRatePercent: string
}

const BLANK: Omit<EditableLine, 'key'> = {
  itemId: null,
  description: '',
  hsnSac: '',
  unit: 'unit',
  quantity: '1',
  unitPrice: '0',
  taxRatePercent: '18',
}

/** Keys are derived from existing rows, so they are pure and never rendered. */
function nextKeyFor(lines: EditableLine[]): string {
  const highest = lines.reduce((max, line) => {
    const n = Number(line.key.replace('line-', ''))
    return Number.isFinite(n) ? Math.max(max, n) : max
  }, -1)
  return `line-${highest + 1}`
}

/** Prices the in-progress form. Returns null while a number is half-typed. */
function priceForPreview(
  lines: EditableLine[],
  discountType: DiscountType,
  discountValue: string,
  supplyKind: ReturnType<typeof resolveSupplyKind>,
) {
  try {
    return priceDocument({
      lines: lines.map((line) => ({
        description: line.description,
        quantity: line.quantity || '0',
        unitPriceMinor: parseMinor(line.unitPrice || '0'),
        taxRatePercent: line.taxRatePercent || '0',
      })),
      discountType,
      discountValue: discountValue || '0',
      supplyKind,
    })
  } catch {
    return null
  }
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

export function InvoiceForm({
  parties,
  items,
  document,
  sellerStateCode,
  docType = 'invoice',
  correctsDocumentId,
}: {
  parties: FormParty[]
  items: FormItem[]
  document?: FormDocument
  sellerStateCode: string
  docType?: 'invoice' | 'credit_note'
  correctsDocumentId?: string
}) {
  // Edit mode is decided by the presence of a real id, not of the object: a
  // credit note is seeded with a copy of the invoice it corrects but has no id
  // of its own yet, and must still create rather than update.
  const isEdit = Boolean(document?.id)
  const action = isEdit
    ? updateInvoice.bind(null, document!.id)
    : (createInvoice as (s: FormState, f: FormData) => Promise<FormState>)

  const [state, formAction] = useActionState(action, emptyFormState)
  const errors = state.fieldErrors
  const idBase = useId()

  const [partyId, setPartyId] = useState(document?.partyId ?? '')
  const [discountType, setDiscountType] = useState<DiscountType>(
    (document?.discountType as DiscountType) ?? 'fixed',
  )
  const [discountValue, setDiscountValue] = useState(document?.discountValue ?? '0')
  const [lines, setLines] = useState<EditableLine[]>(() =>
    document && document.lines.length > 0
      ? document.lines.map((line, index) => ({
          key: `line-${index}`,
          itemId: line.itemId,
          description: line.description,
          hsnSac: line.hsnSac,
          unit: line.unit,
          quantity: line.quantity,
          unitPrice: formatMinor(line.unitPriceMinor),
          taxRatePercent: line.taxRatePercent,
        }))
      : [{ key: 'line-0', ...BLANK }],
  )

  const party = parties.find((p) => p.id === partyId)
  // Derive from the primitive state codes rather than the party object: the
  // React Compiler cannot prove a found object is stable, and bails out of
  // memoizing the whole preview if it is a dependency.
  const buyerStateCode = party?.stateCode ?? ''
  const supplyKind = resolveSupplyKind(sellerStateCode, buyerStateCode)

  // The same module the server uses, so the preview cannot drift from the save.
  // Deliberately not wrapped in useMemo: the React Compiler memoizes this on its
  // own, and a manual memo it cannot verify makes it bail out of optimizing the
  // whole component.
  const priced = priceForPreview(lines, discountType, discountValue, supplyKind)

  const summary = priced ? taxSummary(priced.lines) : []

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function appendLine(fields: Omit<EditableLine, 'key'>) {
    setLines((current) => [...current, { key: nextKeyFor(current), ...fields }])
  }

  function addFromItem(itemId: string) {
    const item = items.find((i) => i.id === itemId)
    if (!item) return
    appendLine({
      itemId: item.id,
      description: item.description || item.name,
      hsnSac: item.hsnSac,
      unit: item.unit,
      quantity: '1',
      unitPrice: formatMinor(item.unitPriceMinor),
      taxRatePercent: item.defaultTaxRatePercent,
    })
  }

  const serialized = JSON.stringify(
    lines.map((line) => ({
      itemId: line.itemId,
      description: line.description,
      hsnSac: line.hsnSac,
      unit: line.unit,
      quantity: line.quantity || '0',
      unitPrice: line.unitPrice || '0',
      taxRatePercent: line.taxRatePercent || '0',
    })),
  )

  const lineError =
    errors.lines ?? Object.entries(errors).find(([k]) => k.startsWith('lines.'))?.[1]

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="lines" value={serialized} />
      <input type="hidden" name="partyId" value={partyId} />
      <input type="hidden" name="discountType" value={discountType} />
      <input type="hidden" name="docType" value={docType} />
      {correctsDocumentId ? (
        <input type="hidden" name="correctsDocumentId" value={correctsDocumentId} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{docType === 'credit_note' ? 'Credit note' : 'Invoice'} details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="party-trigger">Client</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger id="party-trigger" aria-invalid={errors.partyId ? true : undefined}>
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {parties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.partyId ? (
              <p className="text-destructive text-xs">{errors.partyId}</p>
            ) : party ? (
              <p className="text-muted-foreground text-xs">
                {party.stateCode ? stateName(party.stateCode) : 'No place of supply set'} ·{' '}
                {supplyKind === 'inter_state' ? 'IGST applies' : 'CGST + SGST apply'}
              </p>
            ) : null}
          </div>

          <Field
            name="issueDate"
            label="Issue date"
            type="date"
            defaultValue={document?.issueDate ?? today()}
            error={errors.issueDate}
            required
          />
          <Field
            name="dueDate"
            label="Due date"
            type="date"
            defaultValue={document?.dueDate ?? ''}
            error={errors.dueDate}
            hint="Optional."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Line items</CardTitle>
          {items.length > 0 ? (
            <div className="w-56">
              <Select value="" onValueChange={addFromItem}>
                <SelectTrigger aria-label="Add a saved item">
                  <SelectValue placeholder="Add from items..." />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} — {formatMoney(item.unitPriceMinor)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {lines.map((line, index) => {
            const rowId = `${idBase}-row${index}`
            const computed = priced?.lines[index]

            return (
              <div key={line.key} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-12">
                <div className="flex flex-col gap-2 sm:col-span-12 lg:col-span-4">
                  <Label htmlFor={`${rowId}-description`}>Description</Label>
                  <Input
                    id={`${rowId}-description`}
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    placeholder="What are you billing for?"
                  />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-4 lg:col-span-2">
                  <Label htmlFor={`${rowId}-hsn`}>HSN / SAC</Label>
                  <Input
                    id={`${rowId}-hsn`}
                    value={line.hsnSac}
                    onChange={(e) => updateLine(line.key, { hsnSac: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-4 lg:col-span-1">
                  <Label htmlFor={`${rowId}-qty`}>Qty</Label>
                  <Input
                    id={`${rowId}-qty`}
                    type="number"
                    step="0.001"
                    min="0"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
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
                    onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
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
                    value={line.taxRatePercent}
                    onChange={(e) => updateLine(line.key, { taxRatePercent: e.target.value })}
                  />
                </div>
                <div className="flex items-end justify-between gap-2 sm:col-span-8 lg:col-span-2">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Line total</span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(computed?.lineTotalMinor ?? 0)}
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
                      setLines((current) => current.filter((c) => c.key !== line.key))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            )
          })}

          <div>
            <Button type="button" variant="outline" onClick={() => appendLine(BLANK)}>
              <Plus />
              Add line
            </Button>
          </div>

          {lineError ? <p className="text-destructive text-xs">{lineError}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Discount</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="discount-type-trigger">Discount type</Label>
              <Select
                value={discountType}
                onValueChange={(v) => setDiscountType(v as DiscountType)}
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
                onChange={(e) => setDiscountValue(e.target.value)}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatMoney(priced?.subtotalMinor ?? 0)}</span>
            </div>
            {priced && priced.discountMinor > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="tabular-nums">−{formatMoney(priced.discountMinor)}</span>
              </div>
            ) : null}
            {summary.map((row) => (
              <div key={`${row.component}${row.ratePercent}`} className="flex justify-between">
                <span className="text-muted-foreground">
                  {row.component} @ {row.ratePercent}%
                </span>
                <span className="tabular-nums">{formatMoney(row.amountMinor)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t pt-3 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(priced?.totalMinor ?? 0)}</span>
            </div>
            <p className="text-muted-foreground text-xs">
              Saved as a draft. Nothing reaches the ledger until you post it.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notes &amp; terms</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextareaField name="notes" label="Notes" defaultValue={document?.notes} rows={3} placeholder="Shown on the invoice." />
          <TextareaField name="terms" label="Terms" defaultValue={document?.terms} rows={3} placeholder="Payment terms, bank details, etc." />
        </CardContent>
      </Card>

      {state.error ? (
        <p role="alert" className="text-destructive flex items-center gap-2 text-sm">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton label={isEdit ? 'Save draft' : 'Create draft'} />
        <Button asChild variant="ghost">
          <Link href={isEdit ? `/dashboard/invoices/${document!.id}` : '/dashboard/invoices'}>
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  )
}
