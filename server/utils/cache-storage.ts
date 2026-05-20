import { attachDatabasePool } from "@vercel/functions";
import { MongoClient, type Db } from "mongodb";

let mongoClient: MongoClient | undefined;
let mongoClientPromise: Promise<MongoClient> | undefined;

function getRuntimeConfig() {
  const runtimeGlobal = globalThis as typeof globalThis & {
    useRuntimeConfig?: () => { mongodbUri?: unknown; mongodbDb?: unknown };
  };
  return typeof runtimeGlobal.useRuntimeConfig === "function" ?
      runtimeGlobal.useRuntimeConfig()
    : {};
}

export function getMongoUri(): string | undefined {
  const config = getRuntimeConfig();
  const uri = String(config.mongodbUri || process.env.MONGODB_URI || "").trim();
  return uri || undefined;
}

export function hasMongoCacheConfig(): boolean {
  return Boolean(getMongoUri());
}

export function getMongoDatabaseName(): string {
  const config = getRuntimeConfig();
  return (
    String(config.mongodbDb || process.env.MONGODB_DB || "auzura").trim() ||
    "auzura"
  );
}

export function getMongoClient(): Promise<MongoClient> {
  if (mongoClientPromise) return mongoClientPromise;

  const uri = getMongoUri();
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  mongoClient = new MongoClient(uri);
  attachDatabasePool(mongoClient);
  mongoClientPromise = mongoClient.connect();

  return mongoClientPromise;
}

export async function getMongoDatabase(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(getMongoDatabaseName());
}

export async function tryMongoCache<T>(
  operation: () => Promise<T>,
  fallback: T,
): Promise<T> {
  if (!hasMongoCacheConfig()) return fallback;

  try {
    return await operation();
  } catch (error) {
    console.warn(
      "Mongo cache operation failed; continuing without cache.",
      error,
    );
    return fallback;
  }
}

export async function tryWriteMongoCache(
  operation: () => Promise<void>,
): Promise<void> {
  if (!hasMongoCacheConfig()) return;

  try {
    await operation();
  } catch (error) {
    console.warn(
      "Mongo cache write failed; continuing without cache.",
      error,
    );
  }
}
