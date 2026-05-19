import { describe, expect, it } from 'vitest'

import { buildAzureDevOpsOAuthConfig, getAzureAuthorizationHeader } from './azure-auth'

describe('buildAzureDevOpsOAuthConfig', () => {
  it('uses the production auzura.vercel.app callback when no redirect URI is configured', () => {
    const config = buildAzureDevOpsOAuthConfig({
      tenantId: 'tenant-id',
      clientId: 'client-id',
      clientSecret: 'client-secret'
    })

    expect(config.redirectUri).toBe('https://auzura.vercel.app/api/auth/azure/callback')
  })

  it('requests Azure DevOps delegated scope plus offline access for refresh tokens', () => {
    const config = buildAzureDevOpsOAuthConfig({
      tenantId: 'tenant-id',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://localhost:3000/api/auth/azure/callback'
    })

    expect(config.scope).toContain('499b84ac-1321-427f-aa17-267ca6975798/.default')
    expect(config.scope).toContain('offline_access')
  })
})

describe('getAzureAuthorizationHeader', () => {
  it('prefers OAuth bearer access tokens over PAT basic auth', () => {
    expect(getAzureAuthorizationHeader({ accessToken: 'oauth-token', pat: 'pat-token' })).toBe('Bearer oauth-token')
  })

  it('falls back to PAT basic auth when no OAuth token exists', () => {
    const header = getAzureAuthorizationHeader({ pat: 'pat-token' })

    expect(header).toBe(`Basic ${Buffer.from(':pat-token').toString('base64')}`)
  })
})
