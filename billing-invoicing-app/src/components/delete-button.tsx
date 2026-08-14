'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
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

interface DeleteButtonProps {
  /** Server action that performs the delete and reports why if it refuses. */
  action: () => Promise<{ ok: boolean; message: string }>
  title: string
  description: string
  label?: string
}

export function DeleteButton({
  action,
  title,
  description,
  label = 'Delete',
}: DeleteButtonProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleConfirm() {
    startTransition(async () => {
      const result = await action()

      if (result.ok) {
        toast.success(result.message)
        router.refresh()
      } else {
        // e.g. "this client has 3 invoices and cannot be deleted"
        toast.error(result.message)
      }
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={isPending}
          className="text-muted-foreground hover:text-destructive"
        >
          {isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>{label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
