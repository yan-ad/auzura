export type ProjectSection = "tasks" | "report" | "sprint-task" | "settings";

export function getProjectSectionFromPath(path: string): ProjectSection {
  if (path.endsWith("/settings")) return "settings";
  if (path.endsWith("/report")) return "report";
  if (path.endsWith("/sprint-task")) return "sprint-task";
  return "tasks";
}

export function buildProjectSectionPath(
  organization: string,
  project: string,
  section: ProjectSection = "tasks",
): string {
  const org = organization.trim();
  const proj = project.trim();

  if (!org) return "/";
  if (!proj) return `/${encodeURIComponent(org)}`;

  return `/${encodeURIComponent(org)}/${encodeURIComponent(proj)}/${section}`;
}

export function buildProjectStateQuery(
  currentQuery: Record<string, unknown>,
  selection: { team?: string; sprint?: string }
): Record<string, string> {
  const query: Record<string, string> = {}

  for (const [key, value] of Object.entries(currentQuery)) {
    if (key === 'team' || key === 'sprint') continue
    if (typeof value === 'string') query[key] = value
  }

  if (selection.team?.trim()) query.team = selection.team.trim()
  if (selection.sprint?.trim()) query.sprint = selection.sprint.trim()

  return query
}
