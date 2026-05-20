import { getSessionCacheOwnerFromEvent } from "../../utils/project-cache";
import { getDefaultOrganization } from "../../utils/user-cache";

export default defineEventHandler(
  async (
    event,
  ): Promise<{
    organization: Awaited<ReturnType<typeof getDefaultOrganization>>;
  }> => {
    const owner = await getSessionCacheOwnerFromEvent(event);

    if (!owner) {
      return { organization: null };
    }

    return {
      organization: await getDefaultOrganization(owner.key),
    };
  },
);
