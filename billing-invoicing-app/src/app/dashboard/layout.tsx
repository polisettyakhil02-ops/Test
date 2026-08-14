import { redirect } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { auth } from '@/auth'
import { LogoutButton } from '@/components/logout-button'
import { SidebarNav } from '@/components/sidebar-nav'

export default async function DashboardLayout({
  children,
}: LayoutProps<'/dashboard'>) {
  // proxy.ts already redirects unauthenticated requests, but that is an
  // optimistic check on the JWT. This is the authoritative one: it runs in the
  // render path, so no dashboard page can ever render without a real session.
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const { name, email } = session.user

  return (
    <div className="flex min-h-svh">
      <aside className="bg-card hidden w-64 shrink-0 flex-col border-r md:flex">
        <div className="flex items-center gap-2.5 border-b px-5 py-4">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <Receipt className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">
            Billing &amp; Invoicing
          </span>
        </div>

        <SidebarNav />

        <div className="border-t p-3">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{name || 'Admin'}</p>
            <p className="text-muted-foreground truncate text-xs">{email}</p>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sidebar is hidden below md, so the nav repeats here on small screens. */}
        <header className="bg-card flex items-center gap-2 border-b px-4 py-3 md:hidden">
          <div className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
            <Receipt className="size-3.5" />
          </div>
          <span className="text-sm font-semibold">Billing &amp; Invoicing</span>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </header>

        <div className="md:hidden">
          <SidebarNav />
        </div>

        <main className="bg-muted/40 flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
