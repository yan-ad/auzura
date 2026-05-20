import { getQuery } from "h3";
import {
  getAzureOrganizationFromQuery,
  withAzureOrganization,
} from "../../../utils/azure-devops";
import {
  getDashboardMetrics,
  type DashboardMetrics,
} from "../../../utils/dashboard-metrics";
import { getSessionCacheOwnerFromEvent } from "../../../utils/project-cache";

function getStringQueryValue(value: unknown): string | undefined {
  const normalized = Array.isArray(value) ? value[0] : value;
  return typeof normalized === "string" && normalized.trim() ?
      normalized.trim()
    : undefined;
}

export default defineEventHandler(
  async (event): Promise<{ metrics: DashboardMetrics }> => {
    const query = getQuery(event);
    const organization = getAzureOrganizationFromQuery(query);
    const project = getStringQueryValue(query.project);
    const owner = await getSessionCacheOwnerFromEvent(event);

    return await withAzureOrganization(
      organization,
      async () => ({
        metrics: await getDashboardMetrics(
          owner?.key || "",
          organization,
          project || "",
        ),
      }),
      event,
    );
  },
);
