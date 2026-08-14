import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Billing &amp; Invoicing</CardTitle>
          <CardDescription>
            Phase 1 complete: project scaffolded, Tailwind and UI primitives wired
            up, Supabase client configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Run <code className="font-mono">supabase/schema.sql</code> in the
            Supabase SQL Editor, then copy <code className="font-mono">.env.example</code>{' '}
            to <code className="font-mono">.env.local</code> and fill in your
            project keys.
          </p>
          <Button disabled>Dashboard — coming in Phase 2</Button>
        </CardContent>
      </Card>
    </main>
  )
}
