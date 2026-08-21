import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface FieldProps extends Omit<React.ComponentProps<'input'>, 'name'> {
  name: string
  label: string
  error?: string
  hint?: string
}

export function Field({ name, label, error, hint, ...props }: FieldProps) {
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {error ? (
        <p id={`${name}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

interface TextareaFieldProps extends Omit<React.ComponentProps<'textarea'>, 'name'> {
  name: string
  label: string
  error?: string
}

export function TextareaField({ name, label, error, ...props }: TextareaFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${name}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  )
}
