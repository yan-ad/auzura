import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { createError } from "h3";
import type { Collection } from "mongodb";
import { getMongoDatabase, tryMongoCache, tryWriteMongoCache } from "./cache-storage";
import type { CacheOwner } from "./project-cache";

export type AzureWebhookSubscription = {
  id: string;
  owner: CacheOwner;
  userKey: string;
  organization: string;
  project: string;
  eventTypes: string[];
  secret: string;
  callbackUrl: string;
  isActive: boolean;
  description?: string;
  lastEventType?: string;
  lastEventResourceId?: string;
  lastReceivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AzureWebhookSubscriptionPublic = Omit<AzureWebhookSubscription, "secret"> & {
  secretPreview: string;
};

export type AzureWebhookEventDocument = {
  id: string;
  organization: string;
  project: string;
  eventType?: string;
  resourceId?: string;
  subscriptionId?: string;
  publisherId?: string;
  message?: string;
  payload: unknown;
  receivedAt: Date;
};

type RuntimeWebhookConfig = {
  azureDevOpsWebhookSecret?: unknown;
};

type AzureServiceHookPayload = {
  id?: string;
  eventType?: string;
  publisherId?: string;
  subscriptionId?: string;
  message?: { text?: string; html?: string; markdown?: string };
  resource?: {
    id?: number | string;
    project?: { name?: string; id?: string };
    fields?: Record<string, unknown>;
    revision?: { fields?: Record<string, unknown> };
    workItemId?: number | string;
  };
  resourceContainers?: {
    project?: { id?: string; baseUrl?: string };
    account?: { id?: string; baseUrl?: string };
    collection?: { id?: string; baseUrl?: string };
  };
};

function getRuntimeConfig(): RuntimeWebhookConfig {
  const runtimeGlobal = globalThis as typeof globalThis & {
    useRuntimeConfig?: () => RuntimeWebhookConfig;
  };
  return typeof runtimeGlobal.useRuntimeConfig === "function" ? runtimeGlobal.useRuntimeConfig() : {};
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEventTypes(value: string[] = []): string[] {
  const normalized = value.map((eventType) => eventType.trim()).filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : ["workitem.created", "workitem.updated", "workitem.deleted", "workitem.restored", "workitem.commented"];
}

function secretPreview(secret: string): string {
  return secret ? `${secret.slice(0, 4)}…${secret.slice(-4)}` : "";
}

function toPublicSubscription(subscription: AzureWebhookSubscription): AzureWebhookSubscriptionPublic {
  const { secret, ...publicSubscription } = subscription;
  return {
    ...publicSubscription,
    secretPreview: secretPreview(secret),
  };
}

function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

function getConfiguredSecret(): string {
  return String(getRuntimeConfig().azureDevOpsWebhookSecret || process.env.AZURE_DEVOPS_WEBHOOK_SECRET || process.env.NUXT_AZURE_DEVOPS_WEBHOOK_SECRET || "").trim();
}

function getExpectedSecret(subscription?: AzureWebhookSubscription | null): string {
  return subscription?.secret || getConfiguredSecret();
}

function getSubscriptionId(organization: string, project: string): string {
  return `${normalizeKey(organization)}:${normalizeKey(project)}`;
}

async function getSubscriptionsCollection(): Promise<Collection<AzureWebhookSubscription>> {
  const db = await getMongoDatabase();
  const collection = db.collection<AzureWebhookSubscription>("azure_webhook_subscriptions");
  await collection.createIndex({ userKey: 1, organization: 1, project: 1 }, { unique: true });
  await collection.createIndex({ organization: 1, project: 1, isActive: 1 });
  await collection.createIndex({ updatedAt: -1 });
  return collection;
}

async function getEventsCollection(): Promise<Collection<AzureWebhookEventDocument>> {
  const db = await getMongoDatabase();
  const collection = db.collection<AzureWebhookEventDocument>("azure_webhook_events");
  await collection.createIndex({ organization: 1, project: 1, receivedAt: -1 });
  await collection.createIndex({ eventType: 1, receivedAt: -1 });
  return collection;
}

function assertWorkspace(organization?: string, project?: string): { organization: string; project: string } {
  const normalizedOrganization = String(organization || "").trim();
  const normalizedProject = String(project || "").trim();

  if (!normalizedOrganization || !normalizedProject) {
    throw createError({
      statusCode: 400,
      statusMessage: "Organization and project are required.",
    });
  }

  return { organization: normalizedOrganization, project: normalizedProject };
}

export function buildAzureWebhookCallbackUrl(baseUrl: string | undefined, organization: string, project: string): string {
  const configuredBaseUrl = String(baseUrl || process.env.NUXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.VERCEL_URL || "").trim();
  const origin = configuredBaseUrl ? configuredBaseUrl.replace(/^([^:]+\.)vercel\.app$/i, "https://$1vercel.app").replace(/\/$/, "") : "";
  const path = `/api/azure/webhooks/work-item/${encodeURIComponent(organization)}/${encodeURIComponent(project)}`;
  return origin ? `${origin}${path}` : path;
}

export async function upsertAzureWebhookSubscription(input: {
  owner: CacheOwner;
  organization?: string;
  project?: string;
  eventTypes?: string[];
  callbackUrl?: string;
  baseUrl?: string;
  secret?: string;
  isActive?: boolean;
  description?: string;
}): Promise<AzureWebhookSubscriptionPublic> {
  const { organization, project } = assertWorkspace(input.organization, input.project);
  if (!input.owner.key) {
    throw createError({ statusCode: 401, statusMessage: "Sign in before managing webhooks." });
  }

  const now = new Date();
  const id = getSubscriptionId(organization, project);
  const collection = await getSubscriptionsCollection();
  const existing = await collection.findOne({ userKey: input.owner.key, organization, project });
  const secret = String(input.secret || existing?.secret || getConfiguredSecret() || generateWebhookSecret()).trim();
  const callbackUrl = String(input.callbackUrl || existing?.callbackUrl || buildAzureWebhookCallbackUrl(input.baseUrl, organization, project)).trim();

  await tryWriteMongoCache(async () => {
    await collection.updateOne(
      { userKey: input.owner.key, organization, project },
      {
        $set: {
          id,
          owner: input.owner,
          userKey: input.owner.key,
          organization,
          project,
          eventTypes: normalizeEventTypes(input.eventTypes || existing?.eventTypes),
          secret,
          callbackUrl,
          isActive: input.isActive ?? existing?.isActive ?? true,
          description: input.description ?? existing?.description,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  });

  const saved = await collection.findOne({ userKey: input.owner.key, organization, project });
  if (!saved) {
    throw createError({ statusCode: 500, statusMessage: "Webhook subscription could not be saved." });
  }

  return toPublicSubscription(saved);
}

export async function listAzureWebhookSubscriptions(input: {
  owner: CacheOwner;
  organization?: string;
  project?: string;
}): Promise<AzureWebhookSubscriptionPublic[]> {
  if (!input.owner.key) return [];

  return await tryMongoCache(async () => {
    const collection = await getSubscriptionsCollection();
    const subscriptions = await collection
      .find({
        userKey: input.owner.key,
        ...(input.organization ? { organization: input.organization } : {}),
        ...(input.project ? { project: input.project } : {}),
      })
      .sort({ updatedAt: -1 })
      .toArray();

    return subscriptions.map(toPublicSubscription);
  }, []);
}

export async function deleteAzureWebhookSubscription(input: {
  owner: CacheOwner;
  organization?: string;
  project?: string;
}): Promise<number> {
  const { organization, project } = assertWorkspace(input.organization, input.project);
  if (!input.owner.key) return 0;

  return await tryMongoCache(async () => {
    const collection = await getSubscriptionsCollection();
    const result = await collection.deleteOne({ userKey: input.owner.key, organization, project });
    return result.deletedCount;
  }, 0);
}

type WebhookHeaders = Headers | Record<string, string | string[] | undefined>;

function getHeaderValue(headers: WebhookHeaders, name: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) || headers.get(name.toLowerCase()) || undefined;
  }

  const directValue = headers[name] || headers[name.toLowerCase()];
  const value = Array.isArray(directValue) ? directValue[0] : directValue;
  return value ? String(value) : undefined;
}

export function verifyAzureWebhookSignature(input: {
  body: string;
  headers: WebhookHeaders;
  secret?: string;
}): boolean {
  const secret = String(input.secret || "").trim();
  if (!secret) return true;

  const signature = getHeaderValue(input.headers, "x-azuredevops-signature") || getHeaderValue(input.headers, "x-hub-signature-256") || getHeaderValue(input.headers, "x-vss-signature") || "";
  const token = getHeaderValue(input.headers, "x-azuredevops-token") || getHeaderValue(input.headers, "x-vss-token") || "";

  if (token && token === secret) return true;
  if (!signature) return false;

  const normalizedSignature = signature.replace(/^sha256=/i, "").trim();
  const expected = createHmac("sha256", secret).update(input.body).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(normalizedSignature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function parseAzureServiceHookPayload(payload: unknown): AzureServiceHookPayload {
  return typeof payload === "object" && payload ? (payload as AzureServiceHookPayload) : {};
}

function getWorkItemProject(payload: AzureServiceHookPayload): string | undefined {
  return String(payload.resource?.project?.name || payload.resource?.fields?.["System.TeamProject"] || payload.resource?.revision?.fields?.["System.TeamProject"] || "").trim() || undefined;
}

export async function receiveAzureWorkItemWebhook(input: {
  organization?: string;
  project?: string;
  body: string;
  headers: WebhookHeaders;
}): Promise<{ accepted: true; eventType?: string; resourceId?: string; subscriptionMatched: boolean }> {
  const { organization, project } = assertWorkspace(input.organization, input.project);
  const payload = parseAzureServiceHookPayload(JSON.parse(input.body || "{}"));
  const collection = await getSubscriptionsCollection();
  const subscription = await collection.findOne({ organization, project, isActive: true });
  const secret = getExpectedSecret(subscription);

  if (!verifyAzureWebhookSignature({ body: input.body, headers: input.headers, secret })) {
    throw createError({ statusCode: 401, statusMessage: "Invalid Azure DevOps webhook signature." });
  }

  const eventType = payload.eventType;
  const eventProject = getWorkItemProject(payload);
  if (eventProject && normalizeKey(eventProject) !== normalizeKey(project)) {
    throw createError({ statusCode: 400, statusMessage: `Webhook project mismatch: expected ${project}, got ${eventProject}.` });
  }

  if (subscription?.eventTypes.length && eventType && !subscription.eventTypes.includes(eventType)) {
    return { accepted: true, eventType, resourceId: String(payload.resource?.id || payload.resource?.workItemId || "") || undefined, subscriptionMatched: false };
  }

  const receivedAt = new Date();
  const resourceId = String(payload.resource?.id || payload.resource?.workItemId || "").trim() || payload.id;
  await tryWriteMongoCache(async () => {
    const events = await getEventsCollection();
    await events.insertOne({
      id: String(payload.id || `${Date.now()}:${Math.random()}`),
      organization,
      project,
      eventType,
      resourceId,
      subscriptionId: payload.subscriptionId,
      publisherId: payload.publisherId,
      message: payload.message?.text || payload.message?.markdown || payload.message?.html,
      payload,
      receivedAt,
    });

    if (subscription) {
      await collection.updateOne(
        { userKey: subscription.userKey, organization, project },
        {
          $set: {
            lastEventType: eventType,
            lastEventResourceId: resourceId,
            lastReceivedAt: receivedAt,
            updatedAt: receivedAt,
          },
        },
      );
    }
  });

  return { accepted: true, eventType, resourceId, subscriptionMatched: Boolean(subscription) };
}
