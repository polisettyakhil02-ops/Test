import Link from 'next/link'
import { Timer } from 'lucide-react'
import { getDb } from '@/db'
import { requireSession } from '@/lib/session'
import { ageingReport } from '@/domain/reports'
import { formatDate, formatMoney, today } from '@/lib/dto'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Ageing · Billing' }
export const dynamic = 'force-dynamic'

const BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const

export default async function AgeingPage() {
  const session = await requireSession()
  const asOf = today()
  const store = await getDb()
  const rows = await ageingReport(store, session.entityId, asOf)
  const total = rows.reduce((sum, r) => sum + r.openMinor, 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ageing</h1>
        <p className="text-muted-foreground text-sm">
          Open invoices as at {formatDate(asOf)} · {formatMoney(total)} outstanding.
          Buckets are derived from the due date, never stored.
        </p>
      </div>

      <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
        {BUCKETS.map((bucket) => {
          const inBucket = rows.filter((r) => r.bucket === bucket)
          const sum = inBucket.reduce((s, r) => s + r.openMinor, 0)
          return (
            <div key={bucket} className="bg-card p-4">
              <p className="text-muted-foreground text-xs font-medium uppercase">
                {bucket === 'current' ? 'Not due' : `${bucket} days`}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(sum)}</p>
              <p className="text-muted-foreground text-xs">
                {inBucket.length} invoice{inBucket.length === 1 ? '' : 's'}
              </p>
            </div>
          )
        })}
      </div>

      <div className="bg-card rounded-xl border">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
              <Timer className="size-5" />
            </div>
            <div>
              <p className="font-medium">Nothing outstanding</p>
              <p className="text-muted-foreground text-sm">Every posted invoice is settled.</p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Age</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.documentId}>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/invoices/${row.documentId}`} className="hover:underline">
                      {row.docNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{row.partyName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(row.issueDate)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {row.dueDate ? formatDate(row.dueDate) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.bucket === 'current' ? 'outline' : 'destructive'}>
                      {row.bucket === 'current' ? 'Not due' : `${row.daysOverdue}d`}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.totalMinor)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(row.openMinor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
