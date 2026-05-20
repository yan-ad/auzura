import { describe, expect, it } from 'vitest'

import { buildWorkItemBatchBody, buildProjectTeamsUrl, buildWorkItemsWiql, chunkWorkItemIds, getAzureCollectionItems, getGraphUsersFromResponse, getRelationTargetIds, groupWorkItemRelations, isAssignedToCandidate, isCreatedByCandidate, normalizeUser, normalizeWorkItem } from './azure-devops'

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

describe('buildProjectTeamsUrl', () => {
  it('uses the organization-level teams endpoint scoped by project id', () => {
    expect(buildProjectTeamsUrl('KiriminAja2026', 'project-guid')).toBe('https://dev.azure.com/KiriminAja2026/_apis/projects/project-guid/teams?api-version=7.1')
  })
})

describe('normalizeUser', () => {
  it('maps Azure Graph user identities for dropdown filters', () => {
    expect(normalizeUser({
      displayName: 'Yan Aditia',
      principalName: 'yan@example.com',
      mailAddress: 'yan@example.com',
      descriptor: 'aad.yan',
      _links: { avatar: { href: 'https://example.com/avatar.png' } }
    })).toEqual({
      displayName: 'Yan Aditia',
      uniqueName: 'yan@example.com',
      email: 'yan@example.com',
      descriptor: 'aad.yan',
      imageUrl: 'https://example.com/avatar.png'
    })
  })
})

describe('getAzureCollectionItems', () => {
  it('accepts Azure collection variants and returns an empty array for malformed responses', () => {
    const item = { id: 'project-guid', name: 'OPI Board' }

    expect(getAzureCollectionItems([item])).toEqual([item])
    expect(getAzureCollectionItems({ value: [item] })).toEqual([item])
    expect(getAzureCollectionItems({ members: [item] })).toEqual([item])
    expect(getAzureCollectionItems({ workItems: [item] })).toEqual([item])
    expect(getAzureCollectionItems({ count: 1, value: [item] })).toEqual([item])
    expect(getAzureCollectionItems({})).toEqual([])
  })
})

describe('getGraphUsersFromResponse', () => {
  it('accepts both Azure Graph value and legacy members response shapes', () => {
    const graphUser = { displayName: 'Yan Aditia', principalName: 'yan@example.com' }

    expect(getGraphUsersFromResponse({ value: [graphUser] })).toEqual([graphUser])
    expect(getGraphUsersFromResponse({ members: [graphUser] })).toEqual([graphUser])
    expect(getGraphUsersFromResponse({})).toEqual([])
  })
})


describe('getRelationTargetIds', () => {
  it('extracts relation work item ids from Azure DevOps relation urls', () => {
    expect(getRelationTargetIds([
      { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/org/project/_apis/wit/workItems/384' },
      { rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/org/project/_apis/wit/workItems/385' },
      { rel: 'AttachedFile', url: 'https://dev.azure.com/org/project/_apis/wit/attachments/file' }
    ])).toEqual([384, 385])
  })
})

describe('groupWorkItemRelations', () => {
  it('groups child and related work items for jira-like collapsible rendering', () => {
    const grouped = groupWorkItemRelations(
      {
        id: 383,
        type: 'Product Backlog Item',
        title: 'Parent PBI',
        state: 'Active',
        tags: [],
        webUrl: '',
        relations: [
          { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/org/project/_apis/wit/workItems/384' },
          { rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/org/project/_apis/wit/workItems/385' }
        ]
      },
      [
        { id: 384, type: 'Task', title: 'Child task', state: 'New', tags: [], webUrl: '' },
        { id: 385, type: 'Bug', title: 'Related bug', state: 'Active', tags: [], webUrl: '' }
      ]
    )

    expect(grouped).toEqual({
      children: [{ id: 384, type: 'Task', title: 'Child task', state: 'New', tags: [], webUrl: '' }],
      related: [{ id: 385, type: 'Bug', title: 'Related bug', state: 'Active', tags: [], webUrl: '' }]
    })
  })
})


describe('buildWorkItemBatchBody', () => {
  it('requests custom story point fields for cached list rendering', () => {
    expect(buildWorkItemBatchBody([383]).fields).toEqual(
      expect.arrayContaining(['Custom.EstimatedSP', 'Custom.Effort'])
    )
  })

  it('does not send fields when expanding relations because Azure DevOps rejects that combination', () => {
    expect(buildWorkItemBatchBody([383], { includeRelations: true })).toEqual({
      ids: [383],
      $expand: 'Relations'
    })
  })
})


describe('normalizeWorkItem', () => {
  it('normalizes custom task and PBI estimate fields', () => {
    const item = normalizeWorkItem({
      id: 383,
      fields: {
        'System.WorkItemType': 'Task',
        'System.Title': 'Build compact list',
        'System.State': 'Active',
        'Custom.EstimatedSP': '3',
        'Custom.Effort': 8
      }
    })

    expect(item.estimatedStoryPoints).toBe(3)
    expect(item.effort).toBe(8)
  })
})
