export type ProjectSection = "tasks" | "report" | "sprint-task" | "settings";

const PROJECT_SECTION_SEGMENTS = new Set<ProjectSection>([
  "tasks",
  "report",
  "sprint-task",
  "settings",
]);
const IGNORED_ASSET_SEGMENTS = new Set(["installHook.js.map"]);

function safelyDecodePathSegment(segment: string): string {
  let value = segment.trim();

  for (let index = 0; index < 25; index += 1) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      break;
    }
  }

  return value;
}

function getPathSegments(path: string): string[] {
  return path
    .split("?")[0]
    ?.split("/")
    .map(safelyDecodePathSegment)
    .filter(Boolean) ?? [];
}

export function normalizeRouteProjectName(project: string): string {
  return safelyDecodePathSegment(project);
}

export function isKnownAssetRequestPath(path: string): boolean {
  const segments = getPathSegments(path);
  return segments.length === 1 && IGNORED_ASSET_SEGMENTS.has(segments[0] || "");
}

export function getRouteProjectParams(path: string): {
  organization: string;
  project: string;
} {
  if (isKnownAssetRequestPath(path)) {
    return { organization: "", project: "" };
  }

  const segments = getPathSegments(path);
  const [organization = "", project = ""] = segments;
  return {
    organization: PROJECT_SECTION_SEGMENTS.has(organization as ProjectSection) ? "" : organization,
    project: PROJECT_SECTION_SEGMENTS.has(project as ProjectSection) ? "" : project,
  };
}

export function getProjectSectionFromPath(path: string): ProjectSection {
  const segments = getPathSegments(path);
  const lastSegment = segments[segments.length - 1] as ProjectSection | undefined;

  if (lastSegment && PROJECT_SECTION_SEGMENTS.has(lastSegment)) {
    return lastSegment;
  }

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

export function buildProjectSectionRoute(
  currentQuery: Record<string, unknown>,
  organization: string,
  project: string,
  section: ProjectSection = "tasks",
  selection: { team?: string; sprint?: string } = {},
): { path: string; query: Record<string, string> } {
  return {
    path: buildProjectSectionPath(organization, project, section),
    query: buildProjectStateQuery(currentQuery, selection),
  }
}
