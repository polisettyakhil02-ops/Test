import mongoose, { type ClientSession } from "mongoose";
import { env } from "./env.js";

mongoose.set("strictQuery", true);

let isConnected = false;

/**
 * Connects to the MongoDB replica set. A replica set (not a standalone
 * instance) is mandatory: multi-document ACID transactions (billing,
 * stock dispensation, bed ADT) require a session-backed transaction,
 * which MongoDB only supports against a replica set or sharded cluster.
 */
export async function connectDatabase(): Promise<typeof mongoose> {
  if (isConnected) return mongoose;

  mongoose.connection.on("connected", () => {
    isConnected = true;
  });
  mongoose.connection.on("disconnected", () => {
    isConnected = false;
  });
  mongoose.connection.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[mongodb] connection error", err);
  });

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 10_000,
    autoIndex: env.NODE_ENV !== "production",
  });

  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/**
 * Runs `work` inside a MongoDB multi-document transaction, retrying on
 * transient transaction errors / write conflicts per the MongoDB driver's
 * recommended retry loop. Every billing, inventory-deduction, and bed-ADT
 * service MUST go through this helper rather than calling
 * `mongoose.startSession()` ad hoc, so retry/rollback semantics stay
 * consistent across the codebase.
 */
export async function withTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(
      async () => {
        result = await work(session);
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
      },
    );
    // `withTransaction` guarantees the callback ran to completion (and was
    // not silently retried past our observation) before resolving.
    return result!;
  } finally {
    await session.endSession();
  }
}
