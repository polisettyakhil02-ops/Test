'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, LayoutDashboard, Package, Scale, Timer, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/items', label: 'Items', icon: Package },
  { href: '/dashboard/invoices', label: 'Documents', icon: FileText },
] as const

const REPORTS = [
  { href: '/dashboard/reports/ageing', label: 'Ageing', icon: Timer },
  { href: '/dashboard/reports/trial-balance', label: 'Trial balance', icon: Scale },
] as const

export function SidebarNav() {
  const pathname = usePathname()

  const item = (href: string, label: string, Icon: React.ComponentType<{ className?: string }>) => {
    const isActive = href === '/dashboard' ? pathname === href : pathname.startsWith(href)
    return (
      <Link
        key={href}
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )}
      >
        <Icon className="size-4 shrink-0" />
        {label}
      </Link>
    )
  }

  return (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {LINKS.map((l) => item(l.href, l.label, l.icon))}
      <p className="text-muted-foreground mt-4 px-3 pb-1 text-xs font-medium uppercase">
        Reports
      </p>
      {REPORTS.map((l) => item(l.href, l.label, l.icon))}
    </nav>
  )
}
