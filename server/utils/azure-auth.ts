import { createError, type H3Event } from "h3";

type RuntimeOAuthConfig = {
  azureDevOpsOrganization?: unknown;
  azureTenantId?: unknown;
  azureClientId?: unknown;
  azureClientSecret?: unknown;
  azureRedirectUri?: unknown;
  azureDevOpsWebhookSecret?: unknown;
};

export type AzureDevOpsOAuthConfig = {
  organization?: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string[];
  authorizationUrl: string;
  tokenUrl: string;
};

export type AzureAuthSessionUser = {
  displayName?: string;
  email?: string;
  image?: string;
};

export type AzureAuthSessionSecure = {
  azureAccessToken?: string;
  azureExpiresAt?: number;
};

type AzureSessionInput = {
  accessToken: string;
  expiresIn?: number;
  displayName?: string;
  email?: string;
  image?: string;
};

export function buildAzureAuthSession(input: AzureSessionInput): {
  user: AzureAuthSessionUser;
  secure: AzureAuthSessionSecure;
} {
  return {
    user: {
      displayName: input.displayName || input.email || "Azure DevOps user",
      email: input.email,
      image: input.image,
    },
    secure: {
      azureAccessToken: input.accessToken,
      azureExpiresAt: Date.now() + (input.expiresIn || 3600) * 1000,
    },
  };
}

export const AZURE_DEVOPS_RESOURCE_ID = "499b84ac-1321-427f-aa17-267ca6975798";
export const AZURE_DEVOPS_DEFAULT_REDIRECT_URI =
  "https://auzura.vercel.app/api/auth/azure/callback";
export const AZURE_DEVOPS_CONNECTION_DATA_API_VERSION = "7.0-preview";

export function getAzureDevOpsConnectionDataUrl(organization: string): string {
  return `https://dev.azure.com/${organization}/_apis/connectionData?api-version=${AZURE_DEVOPS_CONNECTION_DATA_API_VERSION}`;
}

function getRuntimeConfig(): RuntimeOAuthConfig {
  const runtimeGlobal = globalThis as typeof globalThis & {
    useRuntimeConfig?: () => RuntimeOAuthConfig;
  };
  return typeof runtimeGlobal.useRuntimeConfig === "function" ?
      runtimeGlobal.useRuntimeConfig()
    : {};
}

function getString(value: unknown): string {
  return String(value || "").trim();
}

export function buildAzureDevOpsOAuthConfig(
  overrides: Partial<{
    organization: string;
    tenantId: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }> = {},
): AzureDevOpsOAuthConfig {
  const config = getRuntimeConfig();
  const organization = getString(
    overrides.organization ||
      config.azureDevOpsOrganization ||
      process.env.AZURE_DEVOPS_ORGANIZATION ||
      process.env.NUXT_PUBLIC_AZURE_DEVOPS_ORGANIZATION,
  );
  const tenantId = getString(
    overrides.tenantId ||
      config.azureTenantId ||
      process.env.AZURE_TENANT_ID ||
      process.env.NUXT_AZURE_TENANT_ID,
  );
  const clientId = getString(
    overrides.clientId ||
      config.azureClientId ||
      process.env.AZURE_CLIENT_ID ||
      process.env.NUXT_AZURE_CLIENT_ID,
  );
  const clientSecret = getString(
    overrides.clientSecret ||
      config.azureClientSecret ||
      process.env.AZURE_CLIENT_SECRET ||
      process.env.NUXT_AZURE_CLIENT_SECRET,
  );
  const redirectUri = getString(
    overrides.redirectUri ||
      config.azureRedirectUri ||
      process.env.AZURE_REDIRECT_URI ||
      process.env.NUXT_AZURE_REDIRECT_URI ||
      AZURE_DEVOPS_DEFAULT_REDIRECT_URI,
  );

  const missing = [
    !tenantId ? "AZURE_TENANT_ID" : "",
    !clientId ? "AZURE_CLIENT_ID" : "",
    !clientSecret ? "AZURE_CLIENT_SECRET" : "",
  ].filter(Boolean);

  if (missing.length) {
    throw createError({
      statusCode: 500,
      statusMessage: `Azure OAuth is not configured. Missing: ${missing.join(", ")}.`,
    });
  }

  return {
    organization: organization || undefined,
    tenantId,
    clientId,
    clientSecret,
    redirectUri,
    scope: [`${AZURE_DEVOPS_RESOURCE_ID}/.default`, "offline_access"],
    authorizationUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
  };
}

export function getAzureAuthorizationHeader(accessToken?: string): string {
  const token = accessToken?.trim();
  if (token) return `Bearer ${token}`;

  throw createError({
    statusCode: 401,
    statusMessage: "Sign in with Microsoft to access Azure DevOps.",
  });
}

export async function getAzureOAuthAccessToken(
  event?: H3Event,
): Promise<string | undefined> {
  if (!event) return undefined;

  const session = await getUserSession(event);
  return session.secure?.azureAccessToken;
}
