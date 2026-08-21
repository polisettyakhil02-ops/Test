'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Ban, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

/**
 * Posting is a one-way door, so it is a confirmed action rather than a plain
 * button — the dialog says what becomes irreversible.
 */
export function PostButton({
  action,
  label = 'Post',
  title,
  description,
}: {
  action: () => Promise<{ ok: boolean; message: string }>
  label?: string
  title: string
  description: string
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              startTransition(async () => {
                const result = await action()
                if (result.ok) {
                  toast.success(result.message)
                  router.refresh()
                } else {
                  toast.error(result.message)
                }
              })
            }
          >
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function VoidButton({
  action,
  number,
}: {
  action: () => Promise<{ ok: boolean; message: string }>
  number: string
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : <Ban />}
          Void
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void {number}?</AlertDialogTitle>
          <AlertDialogDescription>
            The original ledger entry stays exactly as it is. A reversing entry is
            posted alongside it, so the books show both what happened and that it
            was undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              startTransition(async () => {
                const result = await action()
                if (result.ok) {
                  toast.success(result.message)
                  router.refresh()
                } else {
                  toast.error(result.message)
                }
              })
            }
          >
            Void
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
