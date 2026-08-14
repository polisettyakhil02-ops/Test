'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { createClient, updateClient } from '@/app/dashboard/clients/actions'
import { emptyFormState, type FormState } from '@/lib/form-state'
import { Field, TextareaField } from '@/components/field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ClientDTO } from '@/lib/dto'

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? 'Saving...' : label}
    </Button>
  )
}

export function ClientForm({ client }: { client?: ClientDTO }) {
  const isEdit = Boolean(client)

  // `updateClient` takes the id first, so bind it before useActionState sees it.
  const action = isEdit
    ? updateClient.bind(null, client!.id)
    : (createClient as (state: FormState, formData: FormData) => Promise<FormState>)

  const [state, formAction] = useActionState(action, emptyFormState)
  const errors = state.fieldErrors

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              name="name"
              label="Name"
              defaultValue={client?.name}
              error={errors.name}
              placeholder="Acme Pvt Ltd"
              required
            />
          </div>
          <Field
            name="email"
            label="Email"
            type="email"
            defaultValue={client?.email}
            error={errors.email}
            placeholder="accounts@acme.com"
          />
          <Field
            name="phone"
            label="Phone"
            defaultValue={client?.phone}
            error={errors.phone}
            placeholder="+91 98765 43210"
          />
          <Field
            name="gstin"
            label="GSTIN / Tax ID"
            defaultValue={client?.gstin}
            error={errors.gstin}
            placeholder="29ABCDE1234F1Z5"
            hint="Stored uppercase."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              name="line1"
              label="Address line 1"
              defaultValue={client?.billingAddress.line1}
              error={errors['billingAddress.line1']}
            />
          </div>
          <div className="sm:col-span-2">
            <Field
              name="line2"
              label="Address line 2"
              defaultValue={client?.billingAddress.line2}
              error={errors['billingAddress.line2']}
            />
          </div>
          <Field
            name="city"
            label="City"
            defaultValue={client?.billingAddress.city}
            error={errors['billingAddress.city']}
          />
          <Field
            name="state"
            label="State"
            defaultValue={client?.billingAddress.state}
            error={errors['billingAddress.state']}
          />
          <Field
            name="postalCode"
            label="Postal code"
            defaultValue={client?.billingAddress.postalCode}
            error={errors['billingAddress.postalCode']}
          />
          <Field
            name="country"
            label="Country"
            defaultValue={client?.billingAddress.country || 'India'}
            error={errors['billingAddress.country']}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <TextareaField
            name="notes"
            label="Internal notes"
            defaultValue={client?.notes}
            error={errors.notes}
            placeholder="Not shown on invoices."
            rows={3}
          />
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
