import { describe, expect, it } from 'vitest'

import { buildAssignedToMeWiqlQueries } from './azure-devops'

describe('buildAssignedToMeWiqlQueries', () => {
  it('builds only identity-based queries so assigned filtering does not fail when Azure DevOps rejects @Me in server WIQL', () => {
    const queries = buildAssignedToMeWiqlQueries('OPI Board', ['yan@example.com', 'Yanuar Aditia'])

    expect(queries).toHaveLength(2)
    expect(queries[0]).toContain("[System.TeamProject] = 'OPI Board'")
    expect(queries[0]).toContain("[System.AssignedTo] = 'yan@example.com'")
    expect(queries[0]).not.toContain('@Me')
    expect(queries[1]).toContain("[System.AssignedTo] = 'Yanuar Aditia'")
  })

  it('escapes WIQL string literals in project and assignee values', () => {
    const [query] = buildAssignedToMeWiqlQueries("O'Brien Board", ["O'Brien"])

    expect(query).toContain("[System.TeamProject] = 'O''Brien Board'")
    expect(query).toContain("[System.AssignedTo] = 'O''Brien'")
  })
})
