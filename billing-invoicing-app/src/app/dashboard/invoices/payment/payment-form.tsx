'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { recordPayment } from '@/app/dashboard/invoices/actions'
import { emptyFormState, type FormState } from '@/lib/form-state'
import { formatMinor, parseMinor } from '@/domain/money'
import { formatDate, formatMoney, today } from '@/lib/dto'
import { Field } from '@/components/field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface OpenInvoice {
  id: string
  docNumber: string | null
  issueDate: string
  dueDate: string | null
  totalMinor: number
  openMinor: number
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? 'Recording...' : 'Record payment'}
    </Button>
  )
}

export function PaymentForm({
  parties,
  openInvoices,
  selectedPartyId,
}: {
  parties: Array<{ id: string; name: string }>
  openInvoices: OpenInvoice[]
  selectedPartyId: string
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(
    recordPayment as (s: FormState, f: FormData) => Promise<FormState>,
    emptyFormState,
  )
  const [amount, setAmount] = useState('0.00')
  const [alloc, setAlloc] = useState<Record<string, string>>({})

  const amountMinor = useMemo(() => {
    try {
      return parseMinor(amount || '0')
    } catch {
      return 0
    }
  }, [amount])

  const allocatedMinor = useMemo(
    () =>
      Object.values(alloc).reduce((sum, value) => {
        try {
          return sum + parseMinor(value || '0')
        } catch {
          return sum
        }
      }, 0),
    [alloc],
  )

  const unapplied = amountMinor - allocatedMinor

  const serialized = JSON.stringify(
    Object.entries(alloc)
      .filter(([, v]) => Number(v) > 0)
      .map(([documentId, value]) => ({ documentId, amount: value })),
  )

  /** Fills allocations oldest-first from the payment amount. */
  function autoApply() {
    let remaining = amountMinor
    const next: Record<string, string> = {}
    for (const invoice of openInvoices) {
      if (remaining <= 0) break
      const take = Math.min(remaining, invoice.openMinor)
      next[invoice.id] = formatMinor(take)
      remaining -= take
    }
    setAlloc(next)
  }

  return (
    <form action={formAction} className="flex max-w-4xl flex-col gap-6">
      <input type="hidden" name="allocations" value={serialized} />
      <input type="hidden" name="partyId" value={selectedPartyId} />

      <Card>
        <CardHeader>
          <CardTitle>Receipt</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="party-trigger">Client</Label>
            <Select
              value={selectedPartyId}
              onValueChange={(value) => {
                // Navigating with the party in the URL keeps the open-invoice
                // list server-rendered and always current.
                router.push(`/dashboard/invoices/payment?partyId=${value}`)
              }}
            >
              <SelectTrigger id="party-trigger">
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
          </div>

          <Field
            name="issueDate"
            label="Received on"
            type="date"
            defaultValue={today()}
            error={state.fieldErrors.issueDate}
            required
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={state.fieldErrors.amount ? true : undefined}
            />
            {state.fieldErrors.amount ? (
              <p className="text-destructive text-xs">{state.fieldErrors.amount}</p>
            ) : null}
          </div>

          <div className="sm:col-span-3">
            <Field name="reference" label="Reference" placeholder="UTR / cheque no." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Apply to invoices</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={autoApply} disabled={amountMinor <= 0}>
            Auto-apply oldest first
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {openInvoices.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              This client has no open invoices. The payment will sit as an unapplied
              credit on their account.
            </p>
          ) : (
            openInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="grid items-center gap-3 rounded-lg border p-3 sm:grid-cols-4"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{invoice.docNumber}</span>
                  <span className="text-muted-foreground text-xs">
                    Issued {formatDate(invoice.issueDate)}
                  </span>
                </div>
                <div className="text-muted-foreground text-sm">
                  Due {invoice.dueDate ? formatDate(invoice.dueDate) : '—'}
                </div>
                <div className="text-sm tabular-nums">
                  Open {formatMoney(invoice.openMinor)}
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  aria-label={`Amount to apply to ${invoice.docNumber}`}
                  value={alloc[invoice.id] ?? ''}
                  placeholder="0.00"
                  onChange={(e) =>
                    setAlloc((current) => ({ ...current, [invoice.id]: e.target.value }))
                  }
                />
              </div>
            ))
          )}

          <div className="flex flex-wrap justify-end gap-6 border-t pt-3 text-sm">
            <span>
              Applied <strong className="tabular-nums">{formatMoney(allocatedMinor)}</strong>
            </span>
            <span className={unapplied < 0 ? 'text-destructive' : ''}>
              Unapplied <strong className="tabular-nums">{formatMoney(unapplied)}</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {state.error ? (
        <p role="alert" className="text-destructive flex items-center gap-2 text-sm">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton />
        <Button asChild variant="ghost">
          <Link href="/dashboard/invoices">Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
