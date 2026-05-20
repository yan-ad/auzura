import { createError, readBody } from "h3";
import { listProjects, withAzureOrganization } from "../../utils/azure-devops";
import {
  getSessionCacheOwner,
  setCachedProjects,
} from "../../utils/project-cache";
import { rememberOrganization } from "../../utils/user-cache";

export default defineEventHandler(
  async (
    event,
  ): Promise<{
    organization: string;
    projects: Awaited<ReturnType<typeof listProjects>>;
  }> => {
    const session = await getUserSession(event);
    const owner = getSessionCacheOwner(session.user);

    if (!owner) {
      throw createError({
        statusCode: 401,
        statusMessage: "Sign in required before setup.",
      });
    }

    const body = await readBody<{ organization?: string }>(event);
    const organization = String(body?.organization || "").trim();

    if (!organization) {
      throw createError({
        statusCode: 400,
        statusMessage: "Organization is required.",
      });
    }

    const projects = await withAzureOrganization(
      organization,
      () => listProjects(),
      event,
    );
    await setCachedProjects(owner, organization, projects);
    await rememberOrganization(
      owner,
      {
        id: organization,
        name: organization,
        slug: organization,
        url: `https://dev.azure.com/${organization}`,
      },
      session.user || undefined,
      { makeDefault: true },
    );

    return { organization, projects };
  },
);
