'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Loader2, RotateCw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { DeleteResult } from '@/lib/form-state'

export function DeliverButton({ action }: { action: () => Promise<DeleteResult> }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <Button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await action()
          if (result.ok) {
            toast.success(result.message)
          } else {
            toast.error(result.message)
          }
          router.refresh()
        })
      }
    >
      {isPending ? <Loader2 className="animate-spin" /> : <Send />}
      Deliver now
    </Button>
  )
}

export function RetryButton({ action }: { action: () => Promise<DeleteResult> }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Retry this event"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await action()
          if (result.ok) {
            toast.success(result.message)
          } else {
            toast.error(result.message)
          }
          router.refresh()
        })
      }
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <RotateCw className="size-4" />
      )}
    </Button>
  )
}
