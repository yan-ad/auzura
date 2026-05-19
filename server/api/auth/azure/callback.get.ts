import { createError, getQuery, sendRedirect } from 'h3'
import { buildAzureAuthSession, buildAzureDevOpsOAuthConfig, getAzureDevOpsConnectionDataUrl } from '../../../utils/azure-auth'

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  error?: string
  error_description?: string
}

type ConnectionDataResponse = {
  authenticatedUser?: {
    providerDisplayName?: string
    properties?: {
      Account?: { $value?: string }
      Mail?: { $value?: string }
    }
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code : ''

  if (!code) {
    throw createError({ statusCode: 400, statusMessage: 'Azure OAuth callback is missing code.' })
  }

  const config = buildAzureDevOpsOAuthConfig()
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    scope: config.scope.join(' ')
  })

  const tokens = await $fetch<TokenResponse>(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (tokens.error || !tokens.access_token) {
    throw createError({ statusCode: 401, statusMessage: tokens.error_description || tokens.error || 'Azure OAuth token exchange failed.' })
  }

  const connectionData = await $fetch<ConnectionDataResponse>(getAzureDevOpsConnectionDataUrl(config.organization), {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' }
  })
  const authenticatedUser = connectionData.authenticatedUser
  const email = authenticatedUser?.properties?.Mail?.$value || authenticatedUser?.properties?.Account?.$value

  await setUserSession(event, buildAzureAuthSession({
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in,
    displayName: authenticatedUser?.providerDisplayName,
    email
  }))

  return sendRedirect(event, typeof query.state === 'string' && query.state.startsWith('/') ? query.state : '/')
})
