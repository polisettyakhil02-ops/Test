import Link from 'next/link'
import { AlertTriangle, ArrowRight, FileText, Landmark, Plus, Receipt, Wallet } from 'lucide-react'
import { db } from '@/db'
import { requireSession } from '@/lib/session'
import { dashboardTotals, ageingReport } from '@/domain/reports'
import { listDocuments } from '@/lib/queries'
import { formatDate, formatMoney, settlementOf, SETTLEMENT_LABELS, SETTLEMENT_VARIANTS, today } from '@/lib/dto'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Dashboard · Billing' }
export const dynamic = 'force-dynamic'

function Stat({
  label,
  value,
  hint,
  icon: Icon,
  alarm,
}: {
  label: string
  value: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
  alarm?: boolean
}) {
  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl border p-5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm font-medium">{label}</span>
        <Icon className={alarm ? 'text-destructive size-4' : 'text-muted-foreground size-4'} />
      </div>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{hint}</span>
    </div>
  )
}

export default async function DashboardPage() {
  const session = await requireSession()
  const asOf = today()

  const [totals, ageing, recentPage] = await Promise.all([
    dashboardTotals(db, session.entityId, asOf),
    ageingReport(db, session.entityId, asOf),
    listDocuments(session.entityId, { docType: 'invoice', pageSize: 6 }),
  ])

  const recent = recentPage.rows

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {session.entityName} · every figure below is derived from the ledger.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/reports/trial-balance">
              <Landmark />
              Trial balance
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/invoices/new">
              <Plus />
              New invoice
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Revenue"
          value={formatMoney(totals.revenueMinor)}
          hint="Income account balance, net of credit notes"
          icon={Wallet}
        />
        <Stat
          label="Receivable"
          value={formatMoney(totals.receivableMinor)}
          hint={`${totals.openInvoiceCount} open invoice${totals.openInvoiceCount === 1 ? '' : 's'}`}
          icon={Receipt}
        />
        <Stat
          label="GST payable"
          value={formatMoney(totals.taxPayableMinor)}
          hint="Collected and owed to the tax authority"
          icon={Landmark}
        />
        <Stat
          label="Overdue"
          value={formatMoney(totals.overdueMinor)}
          hint={`${totals.overdueCount} past due · ${totals.draftCount} draft`}
          icon={AlertTriangle}
          alarm={totals.overdueCount > 0}
        />
      </div>

      {ageing.length > 0 ? (
        <div className="bg-card rounded-xl border">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-semibold">Ageing</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/reports/ageing">
                View all
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="grid gap-px bg-border sm:grid-cols-5">
            {(['current', '1-30', '31-60', '61-90', '90+'] as const).map((bucket) => {
              const rows = ageing.filter((r) => r.bucket === bucket)
              const sum = rows.reduce((s, r) => s + r.openMinor, 0)
              return (
                <div key={bucket} className="bg-card p-4">
                  <p className="text-muted-foreground text-xs font-medium uppercase">
                    {bucket === 'current' ? 'Not due' : `${bucket} days`}
                  </p>
                  <p className="mt-1 font-semibold tabular-nums">{formatMoney(sum)}</p>
                  <p className="text-muted-foreground text-xs">{rows.length} invoice{rows.length === 1 ? '' : 's'}</p>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="bg-card rounded-xl border">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Recent invoices</h2>
          {recent.length > 0 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/invoices">
                View all
                <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
              <FileText className="size-5" />
            </div>
            <div>
              <p className="font-medium">No invoices yet</p>
              <p className="text-muted-foreground text-sm">
                Raise your first invoice to start the ledger.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/dashboard/invoices/new">
                <Plus />
                New invoice
              </Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((row) => {
                const state = settlementOf({ ...row, today: asOf })
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/invoices/${row.id}`} className="hover:underline">
                        {row.docNumber ?? 'Draft'}
                      </Link>
                    </TableCell>
                    <TableCell>{row.partyName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(row.issueDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={SETTLEMENT_VARIANTS[state]}>{SETTLEMENT_LABELS[state]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.totalMinor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.totalMinor - row.allocatedMinor)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
