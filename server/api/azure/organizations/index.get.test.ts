import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/azure-devops', () => ({
  getAzureOrganizationFromQuery: vi.fn(() => 'KiriminAja2026'),
  listOrganizations: vi.fn(),
  withAzureOrganization: vi.fn(async (organization, callback, event) => ({ organization, result: await callback(), event }))
}))

describe('azure organizations endpoint', () => {
  let handler: (event: unknown) => Promise<unknown>
  let listOrganizations: ReturnType<typeof vi.fn>
  let withAzureOrganization: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    ;(globalThis as typeof globalThis & { defineEventHandler?: unknown }).defineEventHandler = (input: unknown) => input
    const endpoint = await import('./index.get')
    const azureDevops = await import('../../../utils/azure-devops')
    handler = endpoint.default as (event: unknown) => Promise<unknown>
    listOrganizations = azureDevops.listOrganizations as ReturnType<typeof vi.fn>
    withAzureOrganization = azureDevops.withAzureOrganization as ReturnType<typeof vi.fn>
  })

  it('passes the H3 event into withAzureOrganization so OAuth session cookies are available', async () => {
    listOrganizations.mockResolvedValue([{ id: 'org-id', name: 'Org', slug: 'org' }])
    const event = { node: { req: { headers: { cookie: 'nuxt-session=sealed-session' } } } }

    await handler(event)

    expect(withAzureOrganization).toHaveBeenCalledWith('KiriminAja2026', expect.any(Function), event)
  })
})
