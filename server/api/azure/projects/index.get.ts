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

    if (!refresh && owner) {
      const cachedProjects = await getCachedProjects(owner.key, organization);
      if (cachedProjects.length) {
        return { projects: cachedProjects };
      }
    }

    const projects = await withAzureOrganization(
      organization,
      () => listProjects(),
      event,
    );

    if (owner && organization) {
      await setCachedProjects(owner, organization, projects);
    }

    return { projects };
  },
);
