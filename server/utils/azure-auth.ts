import { createError, type H3Event } from 'h3'

type RuntimeOAuthConfig = {
  azureTenantId?: unknown
  azureClientId?: unknown
  azureClientSecret?: unknown
  azureRedirectUri?: unknown
}

export type AzureDevOpsOAuthConfig = {
  tenantId: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scope: string[]
  authorizationUrl: string
  tokenUrl: string
}

export type AzureAuthSessionUser = {
  displayName?: string
  email?: string
}

export type AzureAuthSessionSecure = {
  azureAccessToken?: string
  azureRefreshToken?: string
  azureExpiresAt?: number
}

export const AZURE_DEVOPS_RESOURCE_ID = '499b84ac-1321-427f-aa17-267ca6975798'
export const AZURE_DEVOPS_DEFAULT_REDIRECT_URI = 'https://auzura.vercel.app/api/auth/azure/callback'

function getRuntimeConfig(): RuntimeOAuthConfig {
  const runtimeGlobal = globalThis as typeof globalThis & { useRuntimeConfig?: () => RuntimeOAuthConfig }
  return typeof runtimeGlobal.useRuntimeConfig === 'function' ? runtimeGlobal.useRuntimeConfig() : {}
}

function getString(value: unknown): string {
  return String(value || '').trim()
}

export function buildAzureDevOpsOAuthConfig(overrides: Partial<{
  tenantId: string
  clientId: string
  clientSecret: string
  redirectUri: string
}> = {}): AzureDevOpsOAuthConfig {
  const config = getRuntimeConfig()
  const tenantId = getString(overrides.tenantId || config.azureTenantId || process.env.AZURE_TENANT_ID || process.env.NUXT_AZURE_TENANT_ID)
  const clientId = getString(overrides.clientId || config.azureClientId || process.env.AZURE_CLIENT_ID || process.env.NUXT_AZURE_CLIENT_ID)
  const clientSecret = getString(overrides.clientSecret || config.azureClientSecret || process.env.AZURE_CLIENT_SECRET || process.env.NUXT_AZURE_CLIENT_SECRET)
  const redirectUri = getString(overrides.redirectUri || config.azureRedirectUri || process.env.AZURE_REDIRECT_URI || process.env.NUXT_AZURE_REDIRECT_URI || AZURE_DEVOPS_DEFAULT_REDIRECT_URI)

  const missing = [
    !tenantId ? 'AZURE_TENANT_ID' : '',
    !clientId ? 'AZURE_CLIENT_ID' : '',
    !clientSecret ? 'AZURE_CLIENT_SECRET' : ''
  ].filter(Boolean)

  if (missing.length) {
    throw createError({
      statusCode: 500,
      statusMessage: `Azure OAuth is not configured. Missing: ${missing.join(', ')}.`
    })
  }

  return {
    tenantId,
    clientId,
    clientSecret,
    redirectUri,
    scope: [`${AZURE_DEVOPS_RESOURCE_ID}/.default`, 'offline_access'],
    authorizationUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  }
}

export function getAzureAuthorizationHeader(input: { accessToken?: string, pat?: string }): string {
  const accessToken = input.accessToken?.trim()
  if (accessToken) return `Bearer ${accessToken}`

  const pat = input.pat?.trim()
  if (pat) return `Basic ${Buffer.from(`:${pat}`).toString('base64')}`

  throw createError({
    statusCode: 500,
    statusMessage: 'Azure DevOps authentication is not configured. Sign in with Microsoft or set AZURE_DEVOPS_TOKEN.'
  })
}

export async function getAzureOAuthAccessToken(event?: H3Event): Promise<string | undefined> {
  if (!event) return undefined
  const getUserSession = (globalThis as typeof globalThis & { getUserSession?: (event: H3Event) => Promise<{ secure?: AzureAuthSessionSecure }> }).getUserSession
  if (typeof getUserSession !== 'function') return undefined

  const session = await getUserSession(event)
  return session.secure?.azureAccessToken
}
