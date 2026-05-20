import { getQuery } from "h3";
import {
  getAzureOrganizationFromQuery,
  listTeamSprints,
  withAzureOrganization,
} from "../../../utils/azure-devops";
import { getSessionCacheOwnerFromEvent } from "../../../utils/project-cache";
import {
  getCachedTeamSprints,
  setCachedTeamSprints,
} from "../../../utils/sprint-cache";

export default defineEventHandler(
  async (
    event,
  ): Promise<{ sprints: Awaited<ReturnType<typeof listTeamSprints>> }> => {
    const query = getQuery(event);
    const organization = getAzureOrganizationFromQuery(query);
    const project = String(query.project || "").trim();
    const team = String(query.team || "").trim();
    const owner = await getSessionCacheOwnerFromEvent(event);

    if (owner) {
      const cached = await getCachedTeamSprints({
        userKey: owner.key,
        organization,
        project,
        team,
      });

      if (cached.isFresh) {
        return { sprints: cached.sprints };
      }
    }

    const sprints = await withAzureOrganization(
      organization,
      () => listTeamSprints(project, team),
      event,
    );

    if (owner) {
      await setCachedTeamSprints({
        userKey: owner.key,
        organization,
        project,
        team,
        sprints,
      });
    }

    return { sprints };
  },
);
