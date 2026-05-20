import { createError, readBody } from "h3";
import { getSessionCacheOwnerFromEvent } from "../../../utils/project-cache";
import { upsertAzureWebhookSubscription } from "../../../utils/azure-webhooks";

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return undefined;
}

export default defineEventHandler(async (event) => {
  const owner = await getSessionCacheOwnerFromEvent(event);
  if (!owner) {
    throw createError({ statusCode: 401, statusMessage: "Sign in before managing webhooks." });
  }

  const body = await readBody(event);
  const webhook = await upsertAzureWebhookSubscription({
    owner,
    organization: getString(body?.organization),
    project: getString(body?.project),
    eventTypes: getStringArray(body?.eventTypes),
    callbackUrl: getString(body?.callbackUrl),
    baseUrl: getString(body?.baseUrl),
    secret: getString(body?.secret),
    isActive: typeof body?.isActive === "boolean" ? body.isActive : undefined,
    description: getString(body?.description),
  });

  return { webhook };
});
