import { describe, expect, it } from 'vitest'

import { buildProjectSectionPath, buildProjectSectionRoute, buildProjectStateQuery, getProjectSectionFromPath, getRouteProjectParams, isKnownAssetRequestPath, normalizeRouteProjectName } from './navigation'

describe('project navigation routes', () => {
  it('uses a standalone sprint task page instead of rendering tasks inside the sidebar route', () => {
    expect(buildProjectSectionPath('KiriminAja2026', 'Architect and Infrastructure', 'sprint-task')).toBe('/KiriminAja2026/Architect%20and%20Infrastructure/sprint-task')
    expect(getProjectSectionFromPath('/KiriminAja2026/Architect%20and%20Infrastructure/sprint-task')).toBe('sprint-task')
  })

  it('does not treat devtools asset map requests as project routes', () => {
    expect(isKnownAssetRequestPath('/installHook.js.map')).toBe(true)
    expect(getRouteProjectParams('/installHook.js.map')).toEqual({ organization: '', project: '' })
  })

  it('extracts decoded project params from Nuxt catch-all aliases when explicit route params are missing', () => {
    expect(getRouteProjectParams('/KiriminAja2026/OPI%20Board/tasks')).toEqual({
      organization: 'KiriminAja2026',
      project: 'OPI Board'
    })
  })

  it('normalizes repeatedly encoded route project names before writing cookies or API query strings', () => {
    expect(normalizeRouteProjectName('OPI%252525252520Board')).toBe('OPI Board')
    expect(buildProjectSectionPath('KiriminAja2026', normalizeRouteProjectName('OPI%252525252520Board'), 'sprint-task')).toBe('/KiriminAja2026/OPI%20Board/sprint-task')
  })

  it('builds a Nuxt router location for switching sections with selected team state', () => {
    expect(buildProjectSectionRoute(
      { team: 'Old Squad', sprint: 'Sprint 1', keyword: '#383' },
      'KiriminAja2026',
      'OPI Board',
      'sprint-task',
      { team: 'Internal Squad' }
    )).toEqual({
      path: '/KiriminAja2026/OPI%20Board/sprint-task',
      query: {
        keyword: '#383',
        team: 'Internal Squad'
      }
    })
  })
})


describe('buildProjectStateQuery', () => {
  it('persists selected team and sprint in URL query params', () => {
    expect(buildProjectStateQuery({}, { team: 'Internal Squad', sprint: 'Product Delivery\\Sprint 5\\Sprint 9 - Internal Squad' })).toEqual({
      team: 'Internal Squad',
      sprint: 'Product Delivery\\Sprint 5\\Sprint 9 - Internal Squad'
    })
  })
})
