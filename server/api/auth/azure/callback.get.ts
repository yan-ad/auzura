import { createError, getQuery, sendRedirect } from "h3";
import {
  buildAzureAuthSession,
  buildAzureDevOpsOAuthConfig,
  getAzureDevOpsConnectionDataUrl,
} from "../../../utils/azure-auth";
import { listOrganizations, withAzureEvent } from "../../../utils/azure-devops";
import { getSessionCacheOwner } from "../../../utils/project-cache";
import { upsertCachedUser } from "../../../utils/user-cache";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type ConnectionDataResponse = {
  authenticatedUser?: {
    providerDisplayName?: string;
    imageUrl?: string;
    properties?: {
      Account?: { $value?: string };
      Mail?: { $value?: string };
    };
    _links?: {
      avatar?: { href?: string };
    };
  };
};

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const code = typeof query.code === "string" ? query.code : "";

  if (!code) {
    throw createError({
      statusCode: 400,
      statusMessage: "Azure OAuth callback is missing code.",
    });
  }

  const config = buildAzureDevOpsOAuthConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    scope: config.scope.join(" "),
  });

  const tokens = await $fetch<TokenResponse>(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (tokens.error || !tokens.access_token) {
    throw createError({
      statusCode: 401,
      statusMessage:
        tokens.error_description ||
        tokens.error ||
        "Azure OAuth token exchange failed.",
    });
  }

  let authenticatedUser: ConnectionDataResponse["authenticatedUser"];

  if (config.organization) {
    const connectionData = await $fetch<ConnectionDataResponse>(
      getAzureDevOpsConnectionDataUrl(config.organization),
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json",
        },
      },
    );
    authenticatedUser = connectionData.authenticatedUser;
  } else {
    // No org configured — fetch user profile from VSSPS instead
    const profile = await $fetch<{
      displayName?: string;
      emailAddress?: string;
      coreAttributes?: {
        Avatar?: { value?: { value?: string } };
      };
    }>(
      "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?details=true&coreAttributes=Avatar&api-version=7.1-preview.3",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json",
        },
      },
    );
    authenticatedUser = {
      providerDisplayName: profile.displayName,
      properties: {
        Mail: { $value: profile.emailAddress },
      },
    };
  }

  const email =
    authenticatedUser?.properties?.Mail?.$value ||
    authenticatedUser?.properties?.Account?.$value;
  const image =
    authenticatedUser?.imageUrl || authenticatedUser?._links?.avatar?.href;

  await setUserSession(
    event,
    buildAzureAuthSession({
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      displayName: authenticatedUser?.providerDisplayName,
      email,
      image,
    }),
  );

  const owner = getSessionCacheOwner({
    displayName: authenticatedUser?.providerDisplayName,
    email,
  });

  if (owner) {
    let organizations: Awaited<ReturnType<typeof listOrganizations>> = [];

    try {
      organizations = await withAzureEvent(event, () => listOrganizations());
    } catch {
      organizations = [];
    }

    await upsertCachedUser({
      owner,
      user: {
        displayName: authenticatedUser?.providerDisplayName,
        email,
        image,
      },
      organizations,
      token: {
        expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
        hasRefreshToken: Boolean(tokens.refresh_token),
      },
      lastLoginAt: new Date(),
    });
  }

  return sendRedirect(
    event,
    typeof query.state === "string" && query.state.startsWith("/") ?
      query.state
    : "/",
  );
});
