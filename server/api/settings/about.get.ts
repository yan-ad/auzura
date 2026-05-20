import { getQuery } from "h3";
import { getSessionCacheOwnerFromEvent } from "../../utils/project-cache";
import { getCachedUser } from "../../utils/user-cache";

type SettingsAboutResponse = {
  azureDevOps: {
    configuredOrganization?: string;
    currentOrganization?: string;
    currentProject?: string;
  };
  build: {
    version: string;
    commit: string;
    shortCommit: string;
  };
  session: {
    displayName?: string;
    email?: string;
    lastLoginAt?: string;
    tokenExpiresAt?: string;
    organizationCount: number;
  };
};

function getRuntimeConfig() {
  const runtimeGlobal = globalThis as typeof globalThis & {
    useRuntimeConfig?: () => { public?: { azureDevOpsOrganization?: unknown } };
  };
  return typeof runtimeGlobal.useRuntimeConfig === "function" ?
      runtimeGlobal.useRuntimeConfig()
    : { public: {} };
}

export default defineEventHandler(
  async (event): Promise<SettingsAboutResponse> => {
    const query = getQuery(event);
    const owner = await getSessionCacheOwnerFromEvent(event);
    const cachedUser = owner ? await getCachedUser(owner.key) : null;
    const session = await getUserSession(event);
    const runtimeConfig = getRuntimeConfig();
    const commit = String(
      process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.GIT_COMMIT_SHA ||
        process.env.COMMIT_SHA ||
        "",
    ).trim();

    return {
      azureDevOps: {
        configuredOrganization:
          String(runtimeConfig.public?.azureDevOpsOrganization || "").trim() ||
          undefined,
        currentOrganization:
          String(query.organization || "").trim() || undefined,
        currentProject: String(query.project || "").trim() || undefined,
      },
      build: {
        version: String(process.env.npm_package_version || "0.0.0").trim(),
        commit,
        shortCommit: commit ? commit.slice(0, 7) : "",
      },
      session: {
        displayName: session.user?.displayName,
        email: session.user?.email,
        lastLoginAt: cachedUser?.lastLoginAt?.toISOString(),
        tokenExpiresAt:
          cachedUser?.token?.expiresAt ?
            new Date(cachedUser.token.expiresAt).toISOString()
          : undefined,
        organizationCount: cachedUser?.organizations?.length ?? 0,
      },
    };
  },
);
