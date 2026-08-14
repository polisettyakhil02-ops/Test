import mongoose from 'mongoose'

// Next.js hot-reloads modules in dev, which would otherwise open a brand new
// connection pool on every save until MongoDB refuses new connections. Caching
// the connection (and the in-flight promise) on `globalThis` survives reloads.

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  var _mongooseCache: MongooseCache | undefined
}

const cached: MongooseCache = globalThis._mongooseCache ?? {
  conn: null,
  promise: null,
}

globalThis._mongooseCache = cached

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn
  }

  const uri = process.env.MONGODB_URI

  if (!uri) {
    throw new Error(
      'Missing MONGODB_URI. Add it to .env.local, then restart `npm run dev`.',
    )
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      // Fail fast instead of silently queueing operations when the DB is down.
      bufferCommands: false,
      dbName: process.env.MONGODB_DB || 'billing',
    })
  }

  try {
    cached.conn = await cached.promise
  } catch (error) {
    // Clear the failed promise so the next call retries instead of forever
    // re-awaiting a rejection.
    cached.promise = null
    throw error
  }

  return cached.conn
}

export default connectToDatabase
