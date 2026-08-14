import { auth } from '@/auth'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata = {
  title: 'Dashboard · Billing & Invoicing',
}

export default async function DashboardPage() {
  const session = await auth()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Signed in as {session?.user?.email}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Metrics coming in Phase 3</CardTitle>
          <CardDescription>
            Total revenue, pending invoice count, and recent invoices will read
            from MongoDB once the Clients, Items, and Invoices screens exist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Auth, the database connection, and the Mongoose models are wired up.
            Use the sidebar links to reach the sections as they are built.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
