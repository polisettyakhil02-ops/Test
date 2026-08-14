import { connectToDatabase } from '@/lib/mongodb'
import { Client } from '@/models/Client'
import { Item } from '@/models/Item'
import { Invoice, round2, type IInvoice, type InvoiceStatus } from '@/models/Invoice'

/** Statuses that represent money still owed to us. */
export const OUTSTANDING_STATUSES: InvoiceStatus[] = [
  'sent',
  'partially_paid',
  'overdue',
]

export interface InvoiceTotals {
  totalBilled: number
  totalPaid: number
  totalDue: number
  invoiceCount: number
}

export interface RecentInvoice {
  id: string
  invoiceNumber: string
  clientName: string
  issueDate: string
  status: InvoiceStatus
  total: number
  amountDue: number
}

export interface DashboardMetrics extends InvoiceTotals {
  pendingCount: number
  overdueCount: number
  draftCount: number
  clientCount: number
  itemCount: number
  recentInvoices: RecentInvoice[]
}

/**
 * Collapses the `$group` output into a fully-populated totals object.
 *
 * Kept pure and separate because the aggregation returns an EMPTY ARRAY when no
 * documents match -- reading `rows[0].totalBilled` directly is a crash on a
 * fresh database, which is exactly the state this app starts in.
 */
export function summarizeTotals(
  rows: Array<Partial<InvoiceTotals>> | undefined | null,
): InvoiceTotals {
  const row = rows?.[0]

  return {
    totalBilled: round2(row?.totalBilled ?? 0),
    totalPaid: round2(row?.totalPaid ?? 0),
    totalDue: round2(row?.totalDue ?? 0),
    invoiceCount: row?.invoiceCount ?? 0,
  }
}

type LeanRecentInvoice = IInvoice & {
  _id: { toString(): string }
  client?: { name?: string } | null
}

/**
 * Prefers the snapshot taken when the invoice was issued, falling back to the
 * live client record. The snapshot is the correct source: renaming a client
 * must not retroactively change invoices already sent under the old name.
 */
export function toRecentInvoice(doc: LeanRecentInvoice): RecentInvoice {
  const snapshotName = doc.clientSnapshot?.name?.trim()
  const liveName = doc.client?.name?.trim()

  return {
    id: doc._id.toString(),
    invoiceNumber: doc.invoiceNumber,
    clientName: snapshotName || liveName || 'Unknown client',
    issueDate: doc.issueDate ? new Date(doc.issueDate).toISOString() : '',
    status: doc.status,
    total: doc.total ?? 0,
    amountDue: doc.amountDue ?? 0,
  }
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  await connectToDatabase()

  const now = new Date()

  const [totalsRows, pendingCount, overdueCount, draftCount, clientCount, itemCount, recentDocs] =
    await Promise.all([
      // Cancelled invoices are excluded everywhere: they are not revenue and
      // they are not owed.
      Invoice.aggregate<Partial<InvoiceTotals>>([
        { $match: { status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: null,
            totalBilled: { $sum: '$total' },
            totalPaid: { $sum: '$amountPaid' },
            totalDue: { $sum: '$amountDue' },
            invoiceCount: { $sum: 1 },
          },
        },
      ]),
      Invoice.countDocuments({ status: { $in: OUTSTANDING_STATUSES } }),
      // Past due and still unpaid, regardless of whether a nightly job has got
      // around to flipping the status to 'overdue' yet.
      Invoice.countDocuments({
        status: { $in: OUTSTANDING_STATUSES },
        dueDate: { $ne: null, $lt: now },
        amountDue: { $gt: 0 },
      }),
      Invoice.countDocuments({ status: 'draft' }),
      Client.countDocuments({}),
      Item.countDocuments({}),
      Invoice.find({ status: { $ne: 'cancelled' } })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('client', 'name')
        .lean<LeanRecentInvoice[]>(),
    ])

  return {
    ...summarizeTotals(totalsRows),
    pendingCount,
    overdueCount,
    draftCount,
    clientCount,
    itemCount,
    recentInvoices: recentDocs.map(toRecentInvoice),
  }
}
