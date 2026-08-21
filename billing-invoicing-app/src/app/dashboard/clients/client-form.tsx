'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { createParty, updateParty } from '@/app/dashboard/clients/actions'
import { emptyFormState, type FormState } from '@/lib/form-state'
import { Field, TextareaField } from '@/components/field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STATE_CODES } from '@/lib/dto'
import { useState } from 'react'

type Party = {
  id: string
  name: string
  email: string
  phone: string
  gstin: string
  stateCode: string
  notes: string
  billingAddress: {
    line1: string
    line2: string
    city: string
    state: string
    postalCode: string
    country: string
  }
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? 'Saving...' : label}
    </Button>
  )
}

export function ClientForm({ party }: { party?: Party }) {
  const isEdit = Boolean(party)
  const action = isEdit
    ? updateParty.bind(null, party!.id)
    : (createParty as (s: FormState, f: FormData) => Promise<FormState>)

  const [state, formAction] = useActionState(action, emptyFormState)
  const errors = state.fieldErrors
  const [stateCode, setStateCode] = useState(party?.stateCode ?? '')

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-6">
      <input type="hidden" name="stateCode" value={stateCode} />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field name="name" label="Name" defaultValue={party?.name} error={errors.name} placeholder="Acme Pvt Ltd" required />
          </div>
          <Field name="email" label="Email" type="email" defaultValue={party?.email} error={errors.email} placeholder="accounts@acme.com" />
          <Field name="phone" label="Phone" defaultValue={party?.phone} error={errors.phone} placeholder="+91 98765 43210" />
          <Field name="gstin" label="GSTIN" defaultValue={party?.gstin} error={errors.gstin} placeholder="29ABCDE1234F1Z5" hint="Stored uppercase." />
          <div className="flex flex-col gap-2">
            <Label htmlFor="state-trigger">Place of supply</Label>
            <Select value={stateCode} onValueChange={setStateCode}>
              <SelectTrigger id="state-trigger">
                <SelectValue placeholder="Select a state" />
              </SelectTrigger>
              <SelectContent>
                {STATE_CODES.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Decides CGST+SGST or IGST on their invoices.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field name="line1" label="Address line 1" defaultValue={party?.billingAddress.line1} />
          </div>
          <div className="sm:col-span-2">
            <Field name="line2" label="Address line 2" defaultValue={party?.billingAddress.line2} />
          </div>
          <Field name="city" label="City" defaultValue={party?.billingAddress.city} />
          <Field name="state" label="State" defaultValue={party?.billingAddress.state} />
          <Field name="postalCode" label="Postal code" defaultValue={party?.billingAddress.postalCode} />
          <Field name="country" label="Country" defaultValue={party?.billingAddress.country || 'India'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <TextareaField name="notes" label="Internal notes" defaultValue={party?.notes} placeholder="Not shown on invoices." rows={3} />
        </CardContent>
      </Card>

      {state.error ? (
        <p role="alert" className="text-destructive flex items-center gap-2 text-sm">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton label={isEdit ? 'Save changes' : 'Create client'} />
        <Button asChild variant="ghost">
          <Link href="/dashboard/clients">Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
