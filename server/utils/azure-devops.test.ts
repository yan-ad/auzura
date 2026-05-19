import { describe, expect, it } from 'vitest'

import { buildWorkItemsWiql, isAssignedToCandidate } from './azure-devops'

describe('buildWorkItemsWiql', () => {
  it('uses Azure DevOps @project context instead of interpolating a project literal', () => {
    const query = buildWorkItemsWiql({ excludeRemoved: true })

    expect(query).toContain('[System.TeamProject] = @project')
    expect(query).toContain("[System.State] <> 'Removed'")
    expect(query).not.toContain('OPI Board')
  })
})

describe('isAssignedToCandidate', () => {
  it('matches normalized work item assignee email or display name against current user candidates', () => {
    expect(isAssignedToCandidate({ assignedToUniqueName: 'yan@example.com' }, ['Yan Aditia', 'yan@example.com'])).toBe(true)
    expect(isAssignedToCandidate({ assignedTo: 'Yan Aditia' }, ['yan@example.com', 'Yan Aditia'])).toBe(true)
    expect(isAssignedToCandidate({ assignedTo: 'Other User' }, ['Yan Aditia', 'yan@example.com'])).toBe(false)
  })
})
