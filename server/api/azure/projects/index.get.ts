import { getQuery } from "h3";
import {
  getAzureOrganizationFromQuery,
  listProjects,
  withAzureOrganization,
} from "../../../utils/azure-devops";
import {
  getCachedProjects,
  getSessionCacheOwner,
  setCachedProjects,
} from "../../../utils/project-cache";

export default defineEventHandler(
  async (
    event,
  ): Promise<{ projects: Awaited<ReturnType<typeof listProjects>> }> => {
    const query = getQuery(event);
    const organization = getAzureOrganizationFromQuery(query);
    const refresh = String(query.refresh || "").trim() === "1";
    const session = await getUserSession(event);
    const owner = getSessionCacheOwner(session.user);

    let cachedProjects: Awaited<ReturnType<typeof getCachedProjects>> = [];

    if (!refresh && owner) {
      cachedProjects = await getCachedProjects(owner.key, organization);
      if (cachedProjects.length) {
        return { projects: cachedProjects };
      }
    }

    const projects = await withAzureOrganization(
      organization,
      () => listProjects(),
      event,
    );

    // Auto-populate the project cache whenever Azure returns fresh data.
    // If Azure gives an empty or malformed collection but we still have an
    // older cache snapshot, prefer that stale cache over an empty sidebar.
    if (owner && organization) {
      if (projects.length) {
        await setCachedProjects(owner, organization, projects);
      } else if (cachedProjects.length) {
        return { projects: cachedProjects };
      }
    }

    return { projects };
  },
);
