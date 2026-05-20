import { getQuery } from "h3";
import {
  getAzureOrganizationFromQuery,
  listOrganizations,
  withAzureOrganization,
} from "../../../utils/azure-devops";
import { getSessionCacheOwner } from "../../../utils/project-cache";
import {
  getCachedOrganizations,
  upsertCachedUser,
} from "../../../utils/user-cache";

export default defineEventHandler(
  async (
    event,
  ): Promise<{
    organizations: Awaited<ReturnType<typeof listOrganizations>>;
  }> => {
    const query = getQuery(event);
    const organization = getAzureOrganizationFromQuery(query);
    const session = await getUserSession(event);
    const owner = getSessionCacheOwner(session.user);

    if (owner) {
      const cachedOrganizations = await getCachedOrganizations(owner.key);

      if (cachedOrganizations.length) {
        return { organizations: cachedOrganizations };
      }
    }

    const organizations = await withAzureOrganization(
      organization,
      () => listOrganizations(),
      event,
    );

    if (owner) {
      await upsertCachedUser({
        owner,
        user: session.user || {},
        organizations,
      });
    }

    return { organizations };
  },
);
