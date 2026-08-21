'use client'

import { useTransition } from 'react'
import { Loader2, LogOut } from 'lucide-react'
import { logout } from '@/app/dashboard/actions'
import { Button } from '@/components/ui/button'

export function LogoutButton() {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="ghost"
      className="text-muted-foreground hover:text-foreground w-full justify-start"
      disabled={isPending}
      onClick={() => startTransition(() => logout())}
    >
      {isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
      Log out
    </Button>
  )
}
