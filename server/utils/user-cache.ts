import { attachDatabasePool } from "@vercel/functions";
import { MongoClient, type Collection, type Db } from "mongodb";
import type { AzureOrganization } from "../../app/types/azure-devops";
import type { AzureAuthSessionUser } from "./azure-auth";
import type { CacheOwner } from "./project-cache";

export type CachedUserDocument = {
  userKey: string;
  owner: CacheOwner;
  user: AzureAuthSessionUser;
  organizations: AzureOrganization[];
  defaultOrganizationSlug?: string;
  token?: {
    expiresAt?: number;
    hasRefreshToken?: boolean;
  };
  lastLoginAt?: Date;
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
    throw new Error("MONGODB_URI is required for user cache.");
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

async function getCollection(): Promise<Collection<CachedUserDocument>> {
  const db = await getDatabase();
  const collection = db.collection<CachedUserDocument>("user_cache");

  await collection.createIndex({ userKey: 1 }, { unique: true });
  await collection.createIndex({ updatedAt: -1 });
  await collection.createIndex({ "organizations.slug": 1 });

  return collection;
}

function mergeOrganizations(
  existing: AzureOrganization[],
  incoming: AzureOrganization[],
  defaultOrganizationSlug?: string,
): AzureOrganization[] {
  const merged = new Map<string, AzureOrganization>();
  const preservedDefaultSlug =
    defaultOrganizationSlug ||
    existing.find((organization) => organization.isDefault)?.slug;

  for (const organization of [...existing, ...incoming]) {
    const slug = String(organization.slug || "").trim();
    if (!slug) continue;

    merged.set(slug, {
      id: organization.id || slug,
      name: organization.name || slug,
      slug,
      url: organization.url,
      isDefault: slug === preservedDefaultSlug,
    });
  }

  return Array.from(merged.values()).sort(
    (first, second) =>
      Number(Boolean(second.isDefault)) - Number(Boolean(first.isDefault)) ||
      first.name.localeCompare(second.name),
  );
}

export async function getCachedUser(
  userKey: string,
): Promise<CachedUserDocument | null> {
  if (!userKey) return null;
  const collection = await getCollection();
  return await collection.findOne({ userKey });
}

export async function getCachedOrganizations(
  userKey: string,
): Promise<AzureOrganization[]> {
  const cachedUser = await getCachedUser(userKey);
  return cachedUser?.organizations ?? [];
}

export async function upsertCachedUser(input: {
  owner: CacheOwner;
  user: AzureAuthSessionUser;
  organizations?: AzureOrganization[];
  defaultOrganizationSlug?: string;
  token?: {
    expiresAt?: number;
    hasRefreshToken?: boolean;
  };
  lastLoginAt?: Date;
}): Promise<void> {
  if (!input.owner.key) return;

  const collection = await getCollection();
  const current = await collection.findOne({ userKey: input.owner.key });
  const organizations = mergeOrganizations(
    current?.organizations ?? [],
    input.organizations ?? [],
    input.defaultOrganizationSlug || current?.defaultOrganizationSlug,
  );
  const defaultOrganizationSlug =
    input.defaultOrganizationSlug ||
    current?.defaultOrganizationSlug ||
    organizations.find((organization) => organization.isDefault)?.slug;

  await collection.updateOne(
    { userKey: input.owner.key },
    {
      $set: {
        userKey: input.owner.key,
        owner: input.owner,
        user: {
          displayName:
            input.user.displayName ||
            current?.user?.displayName ||
            input.owner.displayName,
          email: input.user.email || current?.user?.email || input.owner.email,
          image: input.user.image || current?.user?.image,
        },
        organizations,
        defaultOrganizationSlug,
        token: input.token || current?.token,
        lastLoginAt: input.lastLoginAt || current?.lastLoginAt,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function rememberOrganization(
  owner: CacheOwner,
  organization: AzureOrganization,
  user?: AzureAuthSessionUser,
  options?: { makeDefault?: boolean },
): Promise<void> {
  await upsertCachedUser({
    owner,
    user: user || {
      displayName: owner.displayName,
      email: owner.email,
    },
    organizations: [organization],
    defaultOrganizationSlug:
      options?.makeDefault ? organization.slug : undefined,
  });
}

export async function getDefaultOrganization(
  userKey: string,
): Promise<AzureOrganization | null> {
  const cachedUser = await getCachedUser(userKey);
  if (!cachedUser) return null;

  return (
    cachedUser.organizations.find((organization) => organization.isDefault) ||
    cachedUser.organizations[0] ||
    null
  );
}

export async function purgeCachedUser(userKey: string): Promise<number> {
  if (!userKey) return 0;

  const collection = await getCollection();
  const result = await collection.deleteOne({ userKey });

  return result.deletedCount;
}
