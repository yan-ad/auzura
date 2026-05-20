import { createError, readBody } from "h3";
import { purgeWorkItemCache } from "../../utils/dashboard-metrics";
import {
  getSessionCacheOwnerFromEvent,
  purgeCachedProjects,
} from "../../utils/project-cache";
import {
  purgeCachedSprintTeams,
  purgeCachedTeamSprints,
} from "../../utils/sprint-cache";
import { purgeCachedUser } from "../../utils/user-cache";

type PurgeScope = "workspace" | "all";

export default defineEventHandler(async (event) => {
  const owner = await getSessionCacheOwnerFromEvent(event);

  if (!owner) {
    throw createError({
      statusCode: 401,
      statusMessage: "Sign in required before purging cache.",
    });
  }

  const body = await readBody<{
    organization?: string;
    project?: string;
    scope?: PurgeScope;
  }>(event);
  const scope = body?.scope === "workspace" ? "workspace" : "all";
  const organization = String(body?.organization || "").trim();
  const project = String(body?.project || "").trim();

  const deletedProjects = await purgeCachedProjects(
    owner.key,
    scope === "workspace" ? organization : undefined,
  );
  const deletedWorkItems = await purgeWorkItemCache(
    owner.key,
    scope === "workspace" ? organization : undefined,
    scope === "workspace" ? project : undefined,
  );
  const deletedSprintTeams = await purgeCachedSprintTeams(
    owner.key,
    scope === "workspace" ? organization : undefined,
    scope === "workspace" ? project : undefined,
  );
  const deletedSprints = await purgeCachedTeamSprints(
    owner.key,
    scope === "workspace" ? organization : undefined,
    scope === "workspace" ? project : undefined,
  );
  const deletedUsers = scope === "all" ? await purgeCachedUser(owner.key) : 0;

  return {
    scope,
    deletedProjects,
    deletedWorkItems,
    deletedSprintTeams,
    deletedSprints,
    deletedUsers,
  };
});
