import { attachDatabasePool } from "@vercel/functions";
import { MongoClient, type Collection, type Db } from "mongodb";
import type { AzureWorkItem } from "../../app/types/azure-devops";
import type { CacheOwner } from "./project-cache";

type WorkItemCacheDocument = {
  userKey: string;
  owner: CacheOwner;
  organization: string;
  project: string;
  id: number;
  title: string;
  type: string;
  state: string;
  assignedTo?: string;
  createdBy?: string;
  changedDate?: Date;
  createdDate?: Date;
  cachedAt: Date;
};

export type DashboardMetrics = {
  total: number;
  byState: Array<{ label: string; count: number; percent: number }>;
  byType: Array<{ label: string; count: number; percent: number }>;
  byAssignee: Array<{ label: string; count: number; percent: number }>;
  freshness: Array<{ label: string; count: number; percent: number }>;
  lastSyncedAt?: string;
};

type CountRow = {
  label?: string;
  count: number;
};

type MongoIndex = {
  name: string;
  key: Record<string, number>;
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
    throw new Error("MONGODB_URI is required for dashboard metrics cache.");
  }

  return uri;
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function getDashboardDatabaseName(): string {
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

async function getDashboardDatabase(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(getDashboardDatabaseName());
}

function hasIndexKeys(
  index: MongoIndex,
  expected: Record<string, number>,
): boolean {
  const actualEntries = Object.entries(index.key);
  const expectedEntries = Object.entries(expected);

  if (actualEntries.length !== expectedEntries.length) return false;

  return expectedEntries.every(([key, value]) => index.key[key] === value);
}

async function dropLegacyIndex(
  collection: Collection<WorkItemCacheDocument>,
  expected: Record<string, number>,
): Promise<void> {
  let indexes: MongoIndex[] = [];

  try {
    indexes = (await collection.indexes()) as MongoIndex[];
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";

    if (
      message.includes("ns does not exist") ||
      message.includes("namespace does not exist")
    ) {
      return;
    }

    throw error;
  }

  const legacyIndex = indexes.find((index) => hasIndexKeys(index, expected));

  if (legacyIndex) {
    await collection.dropIndex(legacyIndex.name);
  }
}

async function getWorkItemCacheCollection(): Promise<
  Collection<WorkItemCacheDocument>
> {
  const db = await getDashboardDatabase();
  const collection = db.collection<WorkItemCacheDocument>("work_item_cache");

  await dropLegacyIndex(collection, { organization: 1, project: 1, id: 1 });
  await collection.deleteMany({
    $or: [{ userKey: { $exists: false } }, { userKey: "" }],
  });

  await collection.createIndex(
    { userKey: 1, organization: 1, project: 1, id: 1 },
    { unique: true },
  );
  await collection.createIndex({
    userKey: 1,
    organization: 1,
    project: 1,
    state: 1,
  });
  await collection.createIndex({
    userKey: 1,
    organization: 1,
    project: 1,
    type: 1,
  });
  await collection.createIndex({
    userKey: 1,
    organization: 1,
    project: 1,
    assignedTo: 1,
  });
  await collection.createIndex({
    userKey: 1,
    organization: 1,
    project: 1,
    cachedAt: -1,
  });

  return collection;
}

function getBucketForChangedDate(value?: Date): string {
  if (!value) return "No update date";

  const changedAt = value.getTime();
  if (!Number.isFinite(changedAt)) return "No update date";

  const ageInDays = (Date.now() - changedAt) / 86_400_000;
  if (ageInDays <= 1) return "Updated today";
  if (ageInDays <= 7) return "This week";
  if (ageInDays <= 30) return "This month";
  return "Older";
}

function withPercent(
  rows: CountRow[],
  total: number,
): Array<{ label: string; count: number; percent: number }> {
  return rows.map((row) => ({
    label: row.label || "—",
    count: row.count,
    percent: total ? Math.round((row.count / total) * 100) : 0,
  }));
}

function toCountRows(
  rows: Array<{ _id?: unknown; count?: unknown }>,
): CountRow[] {
  return rows.map((row) => ({
    label: typeof row._id === "string" ? row._id : undefined,
    count: Number(row.count || 0),
  }));
}

export async function cacheWorkItemsForDashboard(
  owner: CacheOwner,
  organization: string,
  project: string,
  items: AzureWorkItem[],
): Promise<void> {
  if (!owner.key || !organization || !project || !items.length) return;

  const collection = await getWorkItemCacheCollection();
  const cachedAt = new Date();

  await collection.bulkWrite(
    items.map((item) => ({
      updateOne: {
        filter: { userKey: owner.key, organization, project, id: item.id },
        update: {
          $set: {
            userKey: owner.key,
            owner,
            organization,
            project,
            id: item.id,
            title: item.title,
            type: item.type,
            state: item.state,
            assignedTo: item.assignedTo || undefined,
            createdBy: item.createdBy || undefined,
            changedDate: parseDate(item.changedDate),
            createdDate: parseDate(item.createdDate),
            cachedAt,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

async function getGroupedCounts(
  collection: Collection<WorkItemCacheDocument>,
  match: Pick<WorkItemCacheDocument, "userKey" | "organization" | "project">,
  field: keyof WorkItemCacheDocument,
  limit?: number,
): Promise<CountRow[]> {
  const pipeline: object[] = [
    { $match: match },
    {
      $group: {
        _id: {
          $ifNull: [
            `$${String(field)}`,
            field === "assignedTo" ? "Unassigned" : "—",
          ],
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1, _id: 1 } },
  ];

  if (limit) {
    pipeline.push({ $limit: limit });
  }

  return toCountRows(
    await collection
      .aggregate<{ _id?: unknown; count?: unknown }>(pipeline)
      .toArray(),
  );
}

export async function getDashboardMetrics(
  userKey: string,
  organization: string,
  project: string,
): Promise<DashboardMetrics> {
  if (!userKey || !organization || !project) {
    return { total: 0, byState: [], byType: [], byAssignee: [], freshness: [] };
  }

  const collection = await getWorkItemCacheCollection();
  const match = { userKey, organization, project };
  const total = await collection.countDocuments(match);
  const [latest, byState, byType, byAssignee, cachedItems] = await Promise.all([
    collection.find(match).sort({ cachedAt: -1 }).limit(1).next(),
    getGroupedCounts(collection, match, "state"),
    getGroupedCounts(collection, match, "type"),
    getGroupedCounts(collection, match, "assignedTo", 6),
    collection.find(match, { projection: { changedDate: 1 } }).toArray(),
  ]);
  const freshnessCounts = new Map<string, number>();

  for (const item of cachedItems) {
    const bucket = getBucketForChangedDate(item.changedDate);
    freshnessCounts.set(bucket, (freshnessCounts.get(bucket) || 0) + 1);
  }

  const freshnessOrder = [
    "Updated today",
    "This week",
    "This month",
    "Older",
    "No update date",
  ];
  const freshness = freshnessOrder
    .filter((label) => freshnessCounts.has(label))
    .map((label) => ({ label, count: freshnessCounts.get(label) || 0 }));

  return {
    total,
    byState: withPercent(byState, total),
    byType: withPercent(byType, total),
    byAssignee: withPercent(byAssignee, total),
    freshness: withPercent(freshness, total),
    lastSyncedAt: latest?.cachedAt.toISOString(),
  };
}
