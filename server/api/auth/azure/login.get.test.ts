import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('h3', () => ({
  getQuery: vi.fn(),
  sendRedirect: vi.fn((_event, target) => target),
}))

vi.mock('ufo', () => ({
  withQuery: vi.fn((url, query) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      params.set(key, String(value))
    }
    return `${url}?${params.toString()}`
  }),
}))

vi.mock('../../../utils/azure-auth', () => ({
  buildAzureDevOpsOAuthConfig: vi.fn(() => ({
    authorizationUrl: 'https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize',
    clientId: 'client-id',
    redirectUri: 'https://example.test/api/auth/azure/callback',
    scope: ['499b84ac-1321-427f-aa17-267ca6975798/.default', 'offline_access'],
  })),
}))

describe('azure login endpoint', () => {
  let handler: (event: unknown) => Promise<string>
  let getQuery: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    ;(globalThis as typeof globalThis & { defineEventHandler?: unknown }).defineEventHandler = (input: unknown) => input
    const endpoint = await import('./login.get')
    const h3 = await import('h3')
    handler = endpoint.default as (event: unknown) => Promise<string>
    getQuery = h3.getQuery as ReturnType<typeof vi.fn>
  })

  it('uses the requested app path as OAuth state so callback returns there', async () => {
    getQuery.mockReturnValue({ redirect: '/org/project/tasks?keyword=%23383' })

    const redirectUrl = await handler({})

    expect(redirectUrl).toContain('state=%2Forg%2Fproject%2Ftasks%3Fkeyword%3D%2523383')
  })

  it('falls back to home when redirect target is unsafe', async () => {
    getQuery.mockReturnValue({ redirect: '//evil.example/phish' })

    const redirectUrl = await handler({})

    expect(redirectUrl).toContain('state=%2F')
    expect(redirectUrl).not.toContain('evil.example')
  })
})
