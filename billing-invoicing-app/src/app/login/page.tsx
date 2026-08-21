import { Receipt } from 'lucide-react'
import { LoginForm } from '@/app/login/login-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata = {
  title: 'Sign in · Billing & Invoicing',
}

export default async function LoginPage(props: PageProps<'/login'>) {
  const searchParams = await props.searchParams
  const raw = searchParams.callbackUrl
  const callbackUrl = typeof raw === 'string' ? raw : '/dashboard'

  return (
    <main className="bg-muted/40 flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-xl">
            <Receipt className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Billing &amp; Invoicing
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your admin credentials to access the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm callbackUrl={callbackUrl} />
          </CardContent>
        </Card>

        <p className="text-muted-foreground text-center text-xs">
          Internal tool. Accounts are created by the administrator.
        </p>
      </div>
    </main>
  )
}
