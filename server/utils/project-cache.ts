import { attachDatabasePool } from "@vercel/functions";
import type { H3Event } from "h3";
import { MongoClient, type Collection, type Db } from "mongodb";
import type { AzureProject } from "../../app/types/azure-devops";

export type CacheOwner = {
  key: string;
  email?: string;
  displayName?: string;
};

type ProjectCacheDocument = {
  userKey: string;
  owner: CacheOwner;
  organization: string;
  projects: AzureProject[];
  updatedAt: Date;
};

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

function getMongoUri(): string {
  const config = getRuntimeConfig();
  const uri = String(config.mongodbUri || process.env.MONGODB_URI || "").trim();

  if (!uri) {
    throw new Error("MONGODB_URI is required for project cache.");
  }

  return uri;
}

function getDatabaseName(): string {
  const config = getRuntimeConfig();
  return (
    String(config.mongodbDb || process.env.MONGODB_DB || "auzura").trim() ||
    "auzura"
  );
}

function getMongoClient(): Promise<MongoClient> {
  if (mongoClientPromise) return mongoClientPromise;

  mongoClient = new MongoClient(getMongoUri());
  attachDatabasePool(mongoClient);
  mongoClientPromise = mongoClient.connect();

  return mongoClientPromise;
}

async function getDatabase(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(getDatabaseName());
}

async function getCollection(): Promise<Collection<ProjectCacheDocument>> {
  const db = await getDatabase();
  const collection = db.collection<ProjectCacheDocument>("project_cache");

  await collection.updateMany(
    {
      userKey: { $exists: true },
      $or: [{ owner: { $exists: false } }, { "owner.key": { $exists: false } }],
    },
    [{ $set: { owner: { key: "$userKey" } } }],
  );

  await collection.createIndex(
    { userKey: 1, organization: 1 },
    { unique: true },
  );
  await collection.createIndex({ updatedAt: -1 });

  return collection;
}

export function getSessionUserKey(
  user?: { email?: string; displayName?: string } | null,
): string | undefined {
  const email = String(user?.email || "")
    .trim()
    .toLowerCase();
  if (email) return email;

  const displayName = String(user?.displayName || "")
    .trim()
    .toLowerCase();
  return displayName || undefined;
}

export function getSessionCacheOwner(
  user?: { email?: string; displayName?: string } | null,
): CacheOwner | undefined {
  const key = getSessionUserKey(user);

  if (!key) return undefined;

  const email =
    String(user?.email || "")
      .trim()
      .toLowerCase() || undefined;
  const displayName = String(user?.displayName || "").trim() || undefined;

  return {
    key,
    email,
    displayName,
  };
}

export async function getSessionCacheOwnerFromEvent(
  event?: H3Event,
): Promise<CacheOwner | undefined> {
  if (!event) return undefined;

  const session = await getUserSession(event);
  return getSessionCacheOwner(session.user);
}

export async function getCachedProjects(
  userKey: string,
  organization: string,
): Promise<AzureProject[]> {
  if (!userKey || !organization) return [];
  const collection = await getCollection();
  const document = await collection.findOne({ userKey, organization });
  return document?.projects ?? [];
}

export async function setCachedProjects(
  owner: CacheOwner,
  organization: string,
  projects: AzureProject[],
): Promise<void> {
  if (!owner.key || !organization) return;
  const collection = await getCollection();
  await collection.updateOne(
    { userKey: owner.key, organization },
    {
      $set: {
        userKey: owner.key,
        owner,
        organization,
        projects,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
}
