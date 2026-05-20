import { describe, expect, it } from 'vitest'

import { buildWorkItemsWiql, chunkWorkItemIds, isAssignedToCandidate, isCreatedByCandidate } from './azure-devops'

describe('buildWorkItemsWiql', () => {
  it('uses Azure DevOps @project context instead of interpolating a project literal', () => {
    const query = buildWorkItemsWiql({ excludeRemoved: true })

    expect(query).toContain('[System.TeamProject] = @project')
    expect(query).toContain("[System.State] <> 'Removed'")
    expect(query).not.toContain('OPI Board')
  })
})

describe('chunkWorkItemIds', () => {
  it('splits large Azure DevOps work item batches under the API limit', () => {
    const ids = Array.from({ length: 501 }, (_, index) => index + 1)

    const chunks = chunkWorkItemIds(ids)

    expect(chunks).toHaveLength(3)
    expect(chunks.map((chunk) => chunk.length)).toEqual([200, 200, 101])
    expect(chunks[0]?.[0]).toBe(1)
    expect(chunks[2]?.[100]).toBe(501)
  })
})

describe('isAssignedToCandidate', () => {
  it('matches normalized work item assignee email or display name against current user candidates', () => {
    expect(isAssignedToCandidate({ assignedToUniqueName: 'yan@example.com' }, ['Yan Aditia', 'yan@example.com'])).toBe(true)
    expect(isAssignedToCandidate({ assignedTo: 'Yan Aditia' }, ['yan@example.com', 'Yan Aditia'])).toBe(true)
    expect(isAssignedToCandidate({ assignedTo: 'Yan Aditia <yan@example.com>' }, ['yan@example.com'])).toBe(true)
    expect(isAssignedToCandidate({ assignedTo: 'yan aditia' }, ['yan.aditia@example.com'])).toBe(true)
    expect(isAssignedToCandidate({ assignedTo: 'Other User' }, ['Yan Aditia', 'yan@example.com'])).toBe(false)
  })
})

describe('isCreatedByCandidate', () => {
  it('matches normalized creator display name against selected member candidates', () => {
    expect(isCreatedByCandidate({ createdBy: 'Yan Aditia' }, ['yan.aditia@example.com'])).toBe(true)
    expect(isCreatedByCandidate({ createdBy: 'Other User' }, ['Yan Aditia'])).toBe(false)
  })
})
