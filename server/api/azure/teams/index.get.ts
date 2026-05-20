import { getQuery } from "h3";
import {
  getAzureOrganizationFromQuery,
  listProjectTeams,
  withAzureOrganization,
} from "../../../utils/azure-devops";
import { getSessionCacheOwnerFromEvent } from "../../../utils/project-cache";
import {
  getCachedProjectTeams,
  setCachedProjectTeams,
} from "../../../utils/sprint-cache";

export default defineEventHandler(
  async (
    event,
  ): Promise<{ teams: Awaited<ReturnType<typeof listProjectTeams>> }> => {
    const query = getQuery(event);
    const organization = getAzureOrganizationFromQuery(query);
    const project = String(query.project || "").trim();
    const owner = await getSessionCacheOwnerFromEvent(event);

    if (owner) {
      const cached = await getCachedProjectTeams({
        userKey: owner.key,
        organization,
        project,
      });

      if (cached.isFresh) {
        return { teams: cached.teams };
      }
    }

    const teams = await withAzureOrganization(
      organization,
      () => listProjectTeams(project),
      event,
    );

    if (owner) {
      await setCachedProjectTeams({
        userKey: owner.key,
        organization,
        project,
        teams,
      });
    }

    return { teams };
  },
);
