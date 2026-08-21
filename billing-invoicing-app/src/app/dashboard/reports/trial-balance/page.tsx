import { getDb } from '@/db'
import { requireSession } from '@/lib/session'
import { trialBalance } from '@/domain/reports'
import { formatMoney } from '@/lib/dto'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Trial balance · Billing' }
export const dynamic = 'force-dynamic'

export default async function TrialBalancePage() {
  const session = await requireSession()
  const store = await getDb()
  const tb = await trialBalance(store, session.entityId)
  const balanced = tb.totalDebitMinor === tb.totalCreditMinor

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trial balance</h1>
        <p className="text-muted-foreground text-sm">
          Every posting, grouped by account. It balances by construction — if it
          ever does not, the ledger is corrupt.
        </p>
      </div>

      <div
        className={cn(
          'rounded-xl border p-4 text-sm',
          balanced
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
            : 'border-destructive bg-destructive/10 text-destructive',
        )}
      >
        {balanced
          ? `Balanced — debits and credits both total ${formatMoney(tb.totalDebitMinor)}.`
          : `NOT BALANCED — debits ${formatMoney(tb.totalDebitMinor)}, credits ${formatMoney(tb.totalCreditMinor)}.`}
      </div>

      <div className="bg-card rounded-xl border">
        {tb.rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-medium">No postings yet</p>
            <p className="text-muted-foreground text-sm">
              Post an invoice and it will appear here.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tb.rows.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm capitalize">
                    {row.type}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.debitMinor > 0 ? formatMoney(row.debitMinor) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.creditMinor > 0 ? formatMoney(row.creditMinor) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(row.balanceMinor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(tb.totalDebitMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(tb.totalCreditMinor)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </div>
  )
}
