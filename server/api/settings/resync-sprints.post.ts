import { createError, readBody } from "h3";
import {
  listProjectTeams,
  listTeamSprints,
  withAzureOrganization,
} from "../../utils/azure-devops";
import { getSessionCacheOwnerFromEvent } from "../../utils/project-cache";

export default defineEventHandler(async (event) => {
  const owner = await getSessionCacheOwnerFromEvent(event);

  if (!owner) {
    throw createError({
      statusCode: 401,
      statusMessage: "Sign in required before re-sync.",
    });
  }

  const body = await readBody<{ organization?: string; project?: string }>(
    event,
  );
  const organization = String(body?.organization || "").trim();
  const project = String(body?.project || "").trim();

  if (!organization || !project) {
    throw createError({
      statusCode: 400,
      statusMessage: "Organization and project are required.",
    });
  }

  return await withAzureOrganization(
    organization,
    async () => {
      const teams = await listProjectTeams(project);
      const sprintGroups = await Promise.all(
        teams.map(async (team) => ({
          team: team.name,
          sprints: await listTeamSprints(project, team.name),
        })),
      );

      return {
        syncedAt: new Date().toISOString(),
        teamCount: teams.length,
        sprintCount: sprintGroups.reduce(
          (total, group) => total + group.sprints.length,
          0,
        ),
        teams: sprintGroups.map((group) => ({
          team: group.team,
          sprintCount: group.sprints.length,
        })),
      };
    },
    event,
  );
});
