import { describe, expect, it } from 'vitest'

import { buildProjectSectionPath, getProjectSectionFromPath } from './navigation'

describe('project navigation routes', () => {
  it('uses a standalone sprint task page instead of rendering tasks inside the sidebar route', () => {
    expect(buildProjectSectionPath('KiriminAja2026', 'Architect and Infrastructure', 'sprint-task')).toBe('/KiriminAja2026/Architect%20and%20Infrastructure/sprint-task')
    expect(getProjectSectionFromPath('/KiriminAja2026/Architect%20and%20Infrastructure/sprint-task')).toBe('sprint-task')
  })
})
