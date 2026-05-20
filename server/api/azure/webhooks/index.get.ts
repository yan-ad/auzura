import { getQuery } from "h3";
import { getSessionCacheOwnerFromEvent } from "../../../utils/project-cache";
import { listAzureWebhookSubscriptions } from "../../../utils/azure-webhooks";

function getStringQueryValue(value: unknown): string | undefined {
  const normalized = Array.isArray(value) ? value[0] : value;
  return typeof normalized === "string" && normalized.trim() ? normalized.trim() : undefined;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const owner = await getSessionCacheOwnerFromEvent(event);
  if (!owner) {
    return { webhooks: [] };
  }

  const webhooks = await listAzureWebhookSubscriptions({
    owner,
    organization: getStringQueryValue(query.organization),
    project: getStringQueryValue(query.project),
  });

  return { webhooks };
});
