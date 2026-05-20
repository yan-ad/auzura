import type { H3Event } from "h3";
import type { Collection } from "mongodb";
import type { AzureProject } from "../../app/types/azure-devops";
import {
  getMongoDatabase,
  tryMongoCache,
  tryWriteMongoCache,
} from "./cache-storage";

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

async function getCollection(): Promise<Collection<ProjectCacheDocument>> {
  const db = await getMongoDatabase();
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

  return await tryMongoCache(async () => {
    const collection = await getCollection();
    const document = await collection.findOne({ userKey, organization });
    return document?.projects ?? [];
  }, []);
}

export async function setCachedProjects(
  owner: CacheOwner,
  organization: string,
  projects: AzureProject[],
): Promise<void> {
  if (!owner.key || !organization) return;

  await tryWriteMongoCache(async () => {
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
  });
}

export async function purgeCachedProjects(
  userKey: string,
  organization?: string,
): Promise<number> {
  if (!userKey) return 0;

  return await tryMongoCache(async () => {
    const collection = await getCollection();
    const result = await collection.deleteMany({
      userKey,
      ...(organization ? { organization } : {}),
    });

    return result.deletedCount;
  }, 0);
}
