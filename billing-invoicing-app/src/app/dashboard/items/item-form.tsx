'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { createItem, updateItem } from '@/app/dashboard/items/actions'
import { emptyFormState, type FormState } from '@/lib/form-state'
import { Field, TextareaField } from '@/components/field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ItemDTO } from '@/lib/dto'

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? 'Saving...' : label}
    </Button>
  )
}

export function ItemForm({ item }: { item?: ItemDTO }) {
  const isEdit = Boolean(item)

  const action = isEdit
    ? updateItem.bind(null, item!.id)
    : (createItem as (state: FormState, formData: FormData) => Promise<FormState>)

  const [state, formAction] = useActionState(action, emptyFormState)
  const errors = state.fieldErrors

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Product or service</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              name="name"
              label="Name"
              defaultValue={item?.name}
              error={errors.name}
              placeholder="Design retainer"
              required
            />
          </div>
          <Field
            name="hsnSac"
            label="HSN / SAC code"
            defaultValue={item?.hsnSac}
            error={errors.hsnSac}
            placeholder="998314"
          />
          <Field
            name="unit"
            label="Unit"
            defaultValue={item?.unit ?? 'unit'}
            error={errors.unit}
            placeholder="hour, unit, month"
          />
          <Field
            name="price"
            label="Price"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={item?.price ?? 0}
            error={errors.price}
            required
          />
          <Field
            name="taxRate"
            label="Tax rate (%)"
            type="number"
            step="0.01"
            min="0"
            max="100"
            inputMode="decimal"
            defaultValue={item?.taxRate ?? 0}
            error={errors.taxRate}
            hint="GST percentage, e.g. 18 for 18%."
            required
          />
          <div className="sm:col-span-2">
            <TextareaField
              name="description"
              label="Description"
              defaultValue={item?.description}
              error={errors.description}
              placeholder="Appears on the invoice line by default."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {state.error ? (
        <p role="alert" className="text-destructive flex items-center gap-2 text-sm">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton label={isEdit ? 'Save changes' : 'Create item'} />
        <Button asChild variant="ghost">
          <Link href="/dashboard/items">Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
