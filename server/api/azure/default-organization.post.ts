import { createError, readBody } from "h3";
import { getSessionCacheOwnerFromEvent } from "../../utils/project-cache";
import { setDefaultOrganization } from "../../utils/user-cache";

export default defineEventHandler(async (event) => {
  const owner = await getSessionCacheOwnerFromEvent(event);

  if (!owner) {
    throw createError({
      statusCode: 401,
      statusMessage: "Sign in required before changing default organization.",
    });
  }

  const session = await getUserSession(event);
  const body = await readBody<{ organization?: string }>(event);
  const organization = String(body?.organization || "").trim();

  if (!organization) {
    throw createError({
      statusCode: 400,
      statusMessage: "Organization is required.",
    });
  }

  return {
    organization: await setDefaultOrganization(
      owner,
      organization,
      session.user || undefined,
    ),
  };
});
