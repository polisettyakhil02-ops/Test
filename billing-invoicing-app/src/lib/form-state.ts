// Plain module, deliberately NOT a 'use server' file: modules marked
// 'use server' may only export async functions, so these shared types and the
// initial state constant cannot live alongside the actions themselves.

export interface FormState {
  error: string | null
  fieldErrors: Record<string, string>
}

export const emptyFormState: FormState = { error: null, fieldErrors: {} }

export interface DeleteResult {
  ok: boolean
  message: string
}
