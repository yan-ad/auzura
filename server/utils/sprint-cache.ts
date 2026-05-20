import { attachDatabasePool } from "@vercel/functions";
import { MongoClient, type Collection, type Db } from "mongodb";
import type { AzureSprint, AzureTeam } from "../../app/types/azure-devops";

const CACHE_TTL_MS = 10 * 60 * 1000;

type CachedTeamsDocument = {
  userKey: string;
  organization: string;
  project: string;
  teams: AzureTeam[];
  updatedAt: Date;
};

type CachedSprintsDocument = {
  userKey: string;
  organization: string;
  project: string;
  team: string;
  sprints: AzureSprint[];
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
    throw new Error("MONGODB_URI is required for sprint cache.");
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

async function getTeamsCollection(): Promise<Collection<CachedTeamsDocument>> {
  const db = await getDatabase();
  const collection = db.collection<CachedTeamsDocument>("team_cache");

  await collection.createIndex(
    { userKey: 1, organization: 1, project: 1 },
    { unique: true },
  );
  await collection.createIndex({ updatedAt: -1 });

  return collection;
}

async function getSprintsCollection(): Promise<
  Collection<CachedSprintsDocument>
> {
  const db = await getDatabase();
  const collection = db.collection<CachedSprintsDocument>("sprint_cache");

  await collection.createIndex(
    { userKey: 1, organization: 1, project: 1, team: 1 },
    { unique: true },
  );
  await collection.createIndex({ updatedAt: -1 });

  return collection;
}

function isFresh(updatedAt?: Date): boolean {
  if (!updatedAt) return false;
  return Date.now() - updatedAt.getTime() < CACHE_TTL_MS;
}

export async function getCachedProjectTeams(input: {
  userKey: string;
  organization: string;
  project: string;
}): Promise<{ teams: AzureTeam[]; isFresh: boolean }> {
  if (!input.userKey || !input.organization || !input.project) {
    return { teams: [], isFresh: false };
  }

  const collection = await getTeamsCollection();
  const document = await collection.findOne({
    userKey: input.userKey,
    organization: input.organization,
    project: input.project,
  });

  return {
    teams: document?.teams ?? [],
    isFresh: isFresh(document?.updatedAt),
  };
}

export async function setCachedProjectTeams(input: {
  userKey: string;
  organization: string;
  project: string;
  teams: AzureTeam[];
}): Promise<void> {
  if (!input.userKey || !input.organization || !input.project) return;

  const collection = await getTeamsCollection();
  await collection.updateOne(
    {
      userKey: input.userKey,
      organization: input.organization,
      project: input.project,
    },
    {
      $set: {
        userKey: input.userKey,
        organization: input.organization,
        project: input.project,
        teams: input.teams,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function getCachedTeamSprints(input: {
  userKey: string;
  organization: string;
  project: string;
  team: string;
}): Promise<{ sprints: AzureSprint[]; isFresh: boolean }> {
  if (!input.userKey || !input.organization || !input.project || !input.team) {
    return { sprints: [], isFresh: false };
  }

  const collection = await getSprintsCollection();
  const document = await collection.findOne({
    userKey: input.userKey,
    organization: input.organization,
    project: input.project,
    team: input.team,
  });

  return {
    sprints: document?.sprints ?? [],
    isFresh: isFresh(document?.updatedAt),
  };
}

export async function setCachedTeamSprints(input: {
  userKey: string;
  organization: string;
  project: string;
  team: string;
  sprints: AzureSprint[];
}): Promise<void> {
  if (!input.userKey || !input.organization || !input.project || !input.team)
    return;

  const collection = await getSprintsCollection();
  await collection.updateOne(
    {
      userKey: input.userKey,
      organization: input.organization,
      project: input.project,
      team: input.team,
    },
    {
      $set: {
        userKey: input.userKey,
        organization: input.organization,
        project: input.project,
        team: input.team,
        sprints: input.sprints,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function purgeCachedSprintTeams(
  userKey: string,
  organization?: string,
  project?: string,
): Promise<number> {
  const ownerKey = String(userKey || "").trim();
  if (!ownerKey) return 0;

  const collection = await getTeamsCollection();
  const query: {
    userKey: string;
    organization?: string;
    project?: string;
  } = { userKey: ownerKey };

  const normalizedOrganization = String(organization || "").trim();
  const normalizedProject = String(project || "").trim();

  if (normalizedOrganization) {
    query.organization = normalizedOrganization;
  }

  if (normalizedProject) {
    query.project = normalizedProject;
  }

  const result = await collection.deleteMany(query);
  return result.deletedCount ?? 0;
}

export async function purgeCachedTeamSprints(
  userKey: string,
  organization?: string,
  project?: string,
): Promise<number> {
  const ownerKey = String(userKey || "").trim();
  if (!ownerKey) return 0;

  const collection = await getSprintsCollection();
  const query: {
    userKey: string;
    organization?: string;
    project?: string;
  } = { userKey: ownerKey };

  const normalizedOrganization = String(organization || "").trim();
  const normalizedProject = String(project || "").trim();

  if (normalizedOrganization) {
    query.organization = normalizedOrganization;
  }

  if (normalizedProject) {
    query.project = normalizedProject;
  }

  const result = await collection.deleteMany(query);
  return result.deletedCount ?? 0;
}
