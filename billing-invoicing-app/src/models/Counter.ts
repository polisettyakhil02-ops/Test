import { Schema, model, models, type Model } from 'mongoose'

export interface ICounter {
  _id: string
  seq: number
}

const CounterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
})

export const Counter =
  (models.Counter as Model<ICounter>) || model<ICounter>('Counter', CounterSchema)

/**
 * Atomically increments a named counter and returns the new value.
 *
 * MongoDB has no sequences, and "count the documents and add one" races badly
 * under concurrent writes -- two invoices created at the same moment both read
 * N and both become N+1. A single findOneAndUpdate with $inc is atomic at the
 * document level, so every caller gets a distinct number.
 */
export async function nextSequence(name: string): Promise<number> {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  ).lean<ICounter>()

  if (!counter) {
    throw new Error(`Failed to increment counter "${name}"`)
  }

  return counter.seq
}

export default Counter
