'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setInvoiceStatus } from '@/app/dashboard/invoices/actions'
import { INVOICE_STATUS_LABELS } from '@/lib/dto'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function InvoiceStatusSelect({
  invoiceId,
  status,
}: {
  invoiceId: string
  status: string
}) {
  const [value, setValue] = useState(status)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleChange(next: string) {
    const previous = value
    setValue(next)

    startTransition(async () => {
      const result = await setInvoiceStatus(invoiceId, next)

      if (result.ok) {
        toast.success(result.message)
        router.refresh()
      } else {
        // Put the control back where it was; the change did not stick.
        setValue(previous)
        toast.error(result.message)
      }
    })
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-40" aria-label="Invoice status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(INVOICE_STATUS_LABELS).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
