import type { Collection } from "mongodb";
import type { AzureOrganization } from "../../app/types/azure-devops";
import type { AzureAuthSessionUser } from "./azure-auth";
import {
  getMongoDatabase,
  tryMongoCache,
  tryWriteMongoCache,
} from "./cache-storage";
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

let indexesInitialized = false;

function isIndexPermissionError(error: unknown): boolean {
  if (typeof error !== "object" || !error) return false;

  const code = "code" in error ? Number(error.code) : undefined;
  const message =
    "message" in error && typeof error.message === "string" ?
      error.message.toLowerCase()
    : "";

  if (code === 13 || code === 18) return true;

  return (
    message.includes("requires authentication") ||
    message.includes("not authorized") ||
    message.includes("unauthorized") ||
    message.includes("createindexes")
  );
}

async function ensureIndexes(collection: Collection<CachedUserDocument>) {
  if (indexesInitialized) return;

  try {
    await collection.createIndex({ userKey: 1 }, { unique: true });
    await collection.createIndex({ updatedAt: -1 });
    await collection.createIndex({ "organizations.slug": 1 });
  } catch (error) {
    if (!isIndexPermissionError(error)) {
      throw error;
    }

    console.warn(
      "Skipping user cache index creation due to Mongo permissions.",
      error,
    );
  }

  indexesInitialized = true;
}

async function getCollection(): Promise<Collection<CachedUserDocument>> {
  const db = await getMongoDatabase();
  const collection = db.collection<CachedUserDocument>("user_cache");

  await ensureIndexes(collection);

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

  return await tryMongoCache(async () => {
    const collection = await getCollection();
    return await collection.findOne({ userKey });
  }, null);
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

  await tryWriteMongoCache(async () => {
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
            email:
              input.user.email || current?.user?.email || input.owner.email,
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
  });
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

export async function setDefaultOrganization(
  owner: CacheOwner,
  organizationSlug: string,
  user?: AzureAuthSessionUser,
): Promise<AzureOrganization | null> {
  const slug = organizationSlug.trim();
  if (!owner.key || !slug) return null;

  const current = await getCachedUser(owner.key);
  const existingOrganization = current?.organizations.find(
    (organization) => organization.slug === slug,
  );

  await upsertCachedUser({
    owner,
    user: user ||
      current?.user || {
        displayName: owner.displayName,
        email: owner.email,
      },
    organizations: existingOrganization ? [existingOrganization] : [],
    defaultOrganizationSlug: slug,
  });

  return await getDefaultOrganization(owner.key);
}

export async function purgeCachedUser(userKey: string): Promise<number> {
  if (!userKey) return 0;

  return await tryMongoCache(async () => {
    const collection = await getCollection();
    const result = await collection.deleteOne({ userKey });

    return result.deletedCount;
  }, 0);
}
