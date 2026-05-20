import { defineEventHandler, getQuery, type H3Event } from "h3";
import {
  getAzureOrganizationFromQuery,
  listProjects,
  withAzureOrganization,
} from "../../utils/azure-devops";
import { getSessionCacheOwnerFromEvent } from "../../utils/project-cache";
import {
  getCachedProjectTeams,
  setCachedProjectTeams,
} from "../../utils/sprint-cache";
type SidebarTeamGroup = {
  project: string;
  teams: Array<{ id: string; name: string }>;
};

export default defineEventHandler(
  async (event: H3Event): Promise<{ projects: SidebarTeamGroup[] }> => {
    const query = getQuery(event);
    const organization = getAzureOrganizationFromQuery(query);
    const owner = await getSessionCacheOwnerFromEvent(event);
    const projects = await withAzureOrganization(
      organization,
      () => listProjects(),
      event,
    );
    const groups: SidebarTeamGroup[] = [];

    for (const project of projects) {
      let teams: Array<{ id: string; name: string }> = [];

      if (owner) {
        const cached = await getCachedProjectTeams({
          userKey: owner.key,
          organization,
          project: project.name,
        });

        if (cached.isFresh) {
          teams = cached.teams;
        } else {
          teams = await withAzureOrganization(
            organization,
            async () => {
              const { listProjectTeams } =
                await import("../../utils/azure-devops");
              return await listProjectTeams(project.name);
            },
            event,
          );

          await setCachedProjectTeams({
            userKey: owner.key,
            organization,
            project: project.name,
            teams,
          });
        }
      } else {
        teams = await withAzureOrganization(
          organization,
          async () => {
            const { listProjectTeams } =
              await import("../../utils/azure-devops");
            return await listProjectTeams(project.name);
          },
          event,
        );
      }

      if (teams.length) {
        groups.push({
          project: project.name,
          teams,
        });
      }
    }

    return { projects: groups };
  },
);
