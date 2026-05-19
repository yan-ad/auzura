import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSession } from 'h3'
import { buildAzureAuthSession, buildAzureDevOpsOAuthConfig, getAzureAuthorizationHeader, getAzureDevOpsConnectionDataUrl, getAzureOAuthAccessToken } from './azure-auth'

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    useSession: vi.fn()
  }
})

describe('buildAzureDevOpsOAuthConfig', () => {
  it('uses the production auzura.vercel.app callback when no redirect URI is configured', () => {
    const config = buildAzureDevOpsOAuthConfig({
      organization: 'org',
      tenantId: 'tenant-id',
      clientId: 'client-id',
      clientSecret: 'client-secret'
    })

    expect(config.redirectUri).toBe('https://auzura.vercel.app/api/auth/azure/callback')
  })

  it('requests Azure DevOps delegated scope plus offline access for refresh tokens', () => {
    const config = buildAzureDevOpsOAuthConfig({
      organization: 'org',
      tenantId: 'tenant-id',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://localhost:3000/api/auth/azure/callback'
    })

    expect(config.scope).toContain('499b84ac-1321-427f-aa17-267ca6975798/.default')
    expect(config.scope).toContain('offline_access')
  })
})

describe('getAzureDevOpsConnectionDataUrl', () => {
  it('uses the Azure DevOps connectionData preview API version', () => {
    expect(getAzureDevOpsConnectionDataUrl('KiriminAja2026')).toBe('https://dev.azure.com/KiriminAja2026/_apis/connectionData?api-version=7.0-preview')
  })
})

describe('buildAzureAuthSession', () => {
  it('keeps the sealed cookie small by storing only the access token and user identity', () => {
    const session = buildAzureAuthSession({
      accessToken: 'access-token',
      expiresIn: 3600,
      displayName: 'Yan Aditia',
      email: 'yan@example.com'
    })

    expect(session.user).toEqual({ displayName: 'Yan Aditia', email: 'yan@example.com' })
    expect(session.secure.azureAccessToken).toBe('access-token')
    expect(session.secure.azureExpiresAt).toBeGreaterThan(Date.now())
    expect(session.secure).not.toHaveProperty('azureRefreshToken')
  })
})

describe('getAzureAuthorizationHeader', () => {
  it('builds a bearer header from an OAuth access token', () => {
    expect(getAzureAuthorizationHeader('oauth-token')).toBe('Bearer oauth-token')
  })

  it('requires an OAuth access token instead of falling back to PAT basic auth', () => {
    expect(() => getAzureAuthorizationHeader()).toThrow('Sign in with Microsoft')
  })
})

describe('getAzureOAuthAccessToken', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReset()
  })

  it('reads the secure access token from the sealed auth session cookie', async () => {
    vi.mocked(useSession).mockResolvedValueOnce({
      data: { secure: { azureAccessToken: 'oauth-token' } }
    } as unknown as Awaited<ReturnType<typeof useSession>>)

    await expect(getAzureOAuthAccessToken({} as Parameters<typeof getAzureOAuthAccessToken>[0])).resolves.toBe('oauth-token')
  })
})
