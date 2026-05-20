type AzureDataScope = {
  organization?: string;
  project?: string;
  team?: string;
};

function keySegment(value: string | undefined) {
  return value?.trim() || "__unset__";
}

export function azureDataKey(
  resource:
    | "organizations"
    | "projects"
    | "users"
    | "teams"
    | "sprints"
    | "sidebar-teams",
  scope: AzureDataScope = {},
) {
  const segments = ["azure", resource];
  const organizationScopedResources = new Set([
    "projects",
    "users",
    "sidebar-teams",
    "teams",
    "sprints",
  ]);

  if (organizationScopedResources.has(resource)) {
    segments.push(keySegment(scope.organization));
  }

  if (resource === "teams" || resource === "sprints") {
    segments.push(keySegment(scope.project));
  }

  if (resource === "sprints") {
    segments.push(keySegment(scope.team));
  }

  return segments.join(":");
}
