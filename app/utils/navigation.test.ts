import { describe, expect, it } from 'vitest'

import {
  buildProjectSectionPath,
  buildProjectSectionRoute,
  buildProjectStateQuery,
  getProjectSectionFromPath,
  getRouteProjectParams,
  isProjectRoute,
} from './navigation'

describe('navigation route helpers', () => {
  it('recognizes project-scoped pages only when organization and project are present', () => {
    expect(isProjectRoute('/org-a/project-a/sprint-task')).toBe(true)
    expect(isProjectRoute('/org-a/project-a/tasks')).toBe(true)
    expect(isProjectRoute('/settings')).toBe(false)
    expect(isProjectRoute('/setup')).toBe(false)
    expect(isProjectRoute('/org-a')).toBe(false)
  })

  it('keeps the route-selected project when building project section paths', () => {
    expect(getRouteProjectParams('/org-a/project-b/sprint-task')).toEqual({
      organization: 'org-a',
      project: 'project-b',
    })
    expect(getProjectSectionFromPath('/org-a/project-b/sprint-task')).toBe('sprint-task')
    expect(buildProjectSectionPath('org-a', 'project-b', 'sprint-task')).toBe('/org-a/project-b/sprint-task')
  })

  it('drops stale sprint query when switching teams so the new project/team can choose its sprint', () => {
    expect(
      buildProjectStateQuery(
        { team: 'Old Team', sprint: 'Project A\\Sprint 1', keyword: '#383' },
        { team: 'Project B Team', resetSprint: true }
      )
    ).toEqual({
      team: 'Project B Team',
      keyword: '#383',
    })
  })

  it('builds sidebar sprint team routes without carrying stale sprint state across projects', () => {
    expect(
      buildProjectSectionRoute(
        { team: 'Project A Team', sprint: 'Project A\\Sprint 1' },
        'org-a',
        'project-b',
        'sprint-task',
        { team: 'Project B Team', resetSprint: true }
      )
    ).toEqual({
      path: '/org-a/project-b/sprint-task',
      query: { team: 'Project B Team' },
    })
  })
})
