import { describe, expect, it } from 'vitest'

import { azureDataKey } from './azure-data-keys'

describe('azure async data keys', () => {
  it('scopes workspace fetches by organization', () => {
    expect(azureDataKey('projects', { organization: 'org-a' })).toBe('azure:projects:org-a')
    expect(azureDataKey('projects', { organization: 'org-b' })).toBe('azure:projects:org-b')
  })

  it('scopes sprint fetches by organization, project, and team', () => {
    expect(
      azureDataKey('sprints', {
        organization: 'org-a',
        project: 'project-a',
        team: 'Team Alpha',
      }),
    ).toBe('azure:sprints:org-a:project-a:Team Alpha')
  })

  it('keeps unset scope segments explicit so cache keys do not collapse', () => {
    expect(azureDataKey('users', { organization: '' })).toBe('azure:users:__unset__')
    expect(
      azureDataKey('sprints', {
        organization: 'org-a',
        project: '',
        team: '',
      }),
    ).toBe('azure:sprints:org-a:__unset__:__unset__')
  })
})
