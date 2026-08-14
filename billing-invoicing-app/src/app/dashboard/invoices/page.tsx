import { FileText } from 'lucide-react'

export const metadata = {
  title: 'Invoices · Billing & Invoicing',
}

export default function InvoicesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-muted-foreground text-sm">
          The invoice engine arrives in Phase 4.
        </p>
      </div>

      <div className="bg-card flex flex-col items-center gap-3 rounded-xl border p-12 text-center">
        <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
          <FileText className="size-5" />
        </div>
        <div>
          <p className="font-medium">Not built yet</p>
          <p className="text-muted-foreground text-sm">
            Clients and items are ready, so invoices can reference them next.
          </p>
        </div>
      </div>
    </div>
  )
}
