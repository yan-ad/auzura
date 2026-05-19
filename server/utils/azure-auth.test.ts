import { describe, expect, it } from 'vitest'

import { buildAzureDevOpsOAuthConfig, getAzureAuthorizationHeader, getAzureDevOpsConnectionDataUrl } from './azure-auth'

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
  it('uses the older stable non-preview API version required by connectionData', () => {
    expect(getAzureDevOpsConnectionDataUrl('KiriminAja2026')).toBe('https://dev.azure.com/KiriminAja2026/_apis/connectionData?api-version=7.0')
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
