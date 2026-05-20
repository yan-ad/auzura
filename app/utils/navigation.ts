export type ProjectSection = 'tasks' | 'report' | 'sprint-task'

export function getProjectSectionFromPath(path: string): ProjectSection {
  if (path.endsWith('/report')) return 'report'
  if (path.endsWith('/sprint-task')) return 'sprint-task'
  return 'tasks'
}

export function buildProjectSectionPath(
  organization: string,
  project: string,
  section: ProjectSection = 'tasks'
): string {
  const org = organization.trim()
  const proj = project.trim()

  if (!org) return '/'
  if (!proj) return `/${encodeURIComponent(org)}`

  return `/${encodeURIComponent(org)}/${encodeURIComponent(proj)}/${section}`
}
