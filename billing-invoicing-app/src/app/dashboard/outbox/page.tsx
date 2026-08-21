import { Radio } from 'lucide-react'
import { getDb } from '@/db'
import { requireSession } from '@/lib/session'
import { MAX_ATTEMPTS, outboxSummary } from '@/domain/webhooks'
import { webhookConfig } from '@/lib/webhook-config'
import { deliverNow, retryEvent } from '@/app/dashboard/outbox/actions'
import { DeliverButton, RetryButton } from '@/app/dashboard/outbox/buttons'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Outbox · Billing' }
export const dynamic = 'force-dynamic'

const dateTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

export default async function OutboxPage() {
  const session = await requireSession()
  const store = await getDb()
  const summary = await outboxSummary(store)
  const configured = webhookConfig() !== null

  const rows = await store.outbox.find({}).sort({ createdAt: -1 }).limit(100).toArray()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outbox</h1>
          <p className="text-muted-foreground text-sm">
            Events written inside the posting transaction, so a rolled-back posting cannot
            leave a webhook already delivered. Delivery is at-least-once — the receiver
            must dedupe on the delivery id.
          </p>
        </div>
        {session.role === 'admin' ? <DeliverButton action={deliverNow} /> : null}
      </div>

      {configured ? null : (
        <div className="bg-card rounded-xl border p-5">
          <p className="font-medium">No endpoint configured</p>
          <p className="text-muted-foreground text-sm">
            Events are still queued — nothing is lost. Set <code>WEBHOOK_ENDPOINT</code> and{' '}
            <code>WEBHOOK_SECRET</code>, then run <code>npm run outbox</code> to drain them.
          </p>
        </div>
      )}

      <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        <Figure label="Pending" value={String(summary.pending)} />
        <Figure label="Delivered" value={String(summary.delivered)} />
        <Figure label="Dead-lettered" value={String(summary.deadLettered)} />
        <Figure
          label="Oldest pending"
          value={summary.oldestPendingAt ? dateTime.format(summary.oldestPendingAt) : '—'}
        />
      </div>

      <div className="bg-card rounded-xl border">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
              <Radio className="size-5" />
            </div>
            <div>
              <p className="font-medium">No events yet</p>
              <p className="text-muted-foreground text-sm">
                Posting an invoice or a payment queues one.
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Topic</TableHead>
                <TableHead>Queued</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Last error</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const dead = !row.deliveredAt && row.attempts >= MAX_ATTEMPTS
                return (
                  <TableRow key={row._id}>
                    <TableCell className="font-medium">{row.topic}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {dateTime.format(row.createdAt)}
                    </TableCell>
                    <TableCell>
                      {row.deliveredAt ? (
                        <Badge variant="success">Delivered</Badge>
                      ) : dead ? (
                        <Badge variant="destructive">Gave up</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{row.attempts}</TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate text-xs">
                      {row.lastError || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {!row.deliveredAt && session.role === 'admin' ? (
                        <RetryButton action={retryEvent.bind(null, row._id)} />
                      ) : null}
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

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-4">
      <p className="text-muted-foreground text-xs font-medium uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}
