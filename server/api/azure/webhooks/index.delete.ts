import { createError, getQuery } from "h3";
import { getSessionCacheOwnerFromEvent } from "../../../utils/project-cache";
import { deleteAzureWebhookSubscription } from "../../../utils/azure-webhooks";

function getStringQueryValue(value: unknown): string | undefined {
  const normalized = Array.isArray(value) ? value[0] : value;
  return typeof normalized === "string" && normalized.trim() ? normalized.trim() : undefined;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const owner = await getSessionCacheOwnerFromEvent(event);
  if (!owner) {
    throw createError({ statusCode: 401, statusMessage: "Sign in before managing webhooks." });
  }

  const deleted = await deleteAzureWebhookSubscription({
    owner,
    organization: getStringQueryValue(query.organization),
    project: getStringQueryValue(query.project),
  });

  return { deleted };
});
