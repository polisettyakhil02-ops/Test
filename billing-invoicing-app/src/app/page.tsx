import { redirect } from 'next/navigation'

export default function Home() {
  // proxy.ts sends unauthenticated users on to /login from here.
  redirect('/dashboard')
}
