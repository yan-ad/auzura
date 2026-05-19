import { describe, expect, it } from 'vitest'

import { getAzureOrganizationFromQuery, withAzureOrganization } from './azure-devops'

describe('dynamic Azure DevOps organization selection', () => {
  it('reads the organization from request query values', () => {
    expect(getAzureOrganizationFromQuery({ organization: 'custom-org' })).toBe('custom-org')
    expect(getAzureOrganizationFromQuery({ org: 'short-org' })).toBe('short-org')
  })

  it('uses a request-scoped organization without leaking it outside the callback', async () => {
    const before = getAzureOrganizationFromQuery({})

    const inside = await withAzureOrganization('custom-org', async () => getAzureOrganizationFromQuery({}))

    expect(inside).toBe('custom-org')
    expect(getAzureOrganizationFromQuery({})).toBe(before)
  })
})
