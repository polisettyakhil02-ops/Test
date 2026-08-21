import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download } from 'lucide-react'
import { getDb } from '@/db'
import { requireSession } from '@/lib/session'
import { getParty } from '@/lib/queries'
import { customerStatement } from '@/domain/statements'
import { DOC_TYPE_LABELS, formatDate, formatMoney, oneYearBefore, today } from '@/lib/dto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Statement · Billing' }
export const dynamic = 'force-dynamic'

const SOURCE_LABELS: Record<string, string> = {
  ...DOC_TYPE_LABELS,
  invoice_reversal: 'Invoice voided',
  credit_note_reversal: 'Credit note voided',
  payment_reversal: 'Payment voided',
}

export default async function StatementPage(
  props: PageProps<'/dashboard/clients/[id]/statement'>,
) {
  const session = await requireSession()
  const { id } = await props.params
  const params = await props.searchParams

  const party = await getParty(session.entityId, id)
  if (!party) notFound()

  const to = typeof params.to === 'string' && params.to ? params.to : today()
  // A year back is the period a customer usually asks for.
  const from = typeof params.from === 'string' && params.from ? params.from : oneYearBefore(to)

  const store = await getDb()
  const statement = await customerStatement(store, session.entityId, id, { from, to })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground w-fit -ml-2">
          <Link href="/dashboard/clients">
            <ArrowLeft />
            Back to clients
          </Link>
        </Button>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{party.name}</h1>
            <p className="text-muted-foreground text-sm">
              Statement of account, {formatDate(from)} – {formatDate(to)}. Read from the
              receivable ledger, so it cannot disagree with the trial balance.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <form
              className="flex flex-wrap items-end gap-3"
              action={`/dashboard/clients/${id}/statement`}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="from">From</Label>
                <Input id="from" name="from" type="date" defaultValue={from} className="w-40" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="to">To</Label>
                <Input id="to" name="to" type="date" defaultValue={to} className="w-40" />
              </div>
              <Button type="submit" variant="outline">
                Show
              </Button>
            </form>

            <Button asChild>
              <a href={`/dashboard/clients/${id}/statement/csv?from=${from}&to=${to}`}>
                <Download />
                CSV
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        <Figure label="Opening balance" value={formatMoney(statement.openingMinor)} />
        <Figure label="Charged" value={formatMoney(statement.chargedMinor)} />
        <Figure label="Settled" value={formatMoney(statement.settledMinor)} />
        <Figure label="Closing balance" value={formatMoney(statement.closingMinor)} strong />
      </div>

      <div className="bg-card rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Charges</TableHead>
              <TableHead className="text-right">Payments</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="text-muted-foreground text-sm">{formatDate(from)}</TableCell>
              <TableCell />
              <TableCell className="text-muted-foreground">Opening balance</TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-right tabular-nums">
                {formatMoney(statement.openingMinor)}
              </TableCell>
            </TableRow>

            {statement.rows.map((row) => (
              <TableRow key={row.entryId}>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(row.date)}
                </TableCell>
                <TableCell className="font-medium">
                  {row.documentId && row.docNumber ? (
                    <Link
                      href={`/dashboard/invoices/${row.documentId}`}
                      className="hover:underline"
                    >
                      {row.docNumber}
                    </Link>
                  ) : (
                    (row.docNumber ?? '—')
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {row.memo || SOURCE_LABELS[row.sourceType] || row.sourceType}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.debitMinor ? formatMoney(row.debitMinor) : ''}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.creditMinor ? formatMoney(row.creditMinor) : ''}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.balanceMinor)}
                </TableCell>
              </TableRow>
            ))}

            <TableRow>
              <TableCell className="text-muted-foreground text-sm">{formatDate(to)}</TableCell>
              <TableCell />
              <TableCell className="font-medium">Closing balance</TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-right font-semibold tabular-nums">
                {formatMoney(statement.closingMinor)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {statement.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing moved on this account between those dates.
        </p>
      ) : null}
    </div>
  )
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-card p-4">
      <p className="text-muted-foreground text-xs font-medium uppercase">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? 'text-xl font-semibold' : 'text-lg font-medium'}`}>
        {value}
      </p>
    </div>
  )
}
