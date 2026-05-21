<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";
import { azureDataKey } from "~/utils/azure-data-keys";
import {
  buildProjectSectionPath,
  buildProjectStateQuery,
  getProjectSectionFromPath,
  getRouteProjectParams,
  isKnownAssetRequestPath,
  isProjectRoute,
  normalizeRouteProjectName,
  type ProjectSection,
} from "~/utils/navigation";
import type {
  AzureOrganization,
  AzureProject,
  AzureSprint,
  AzureTeam,
  AzureUser,
  AzureWorkItem,
  AzureWorkItemRelation,
} from "~/types/azure-devops";

type SectionView = ProjectSection;

const toast = useToast();
const route = useRoute();
const router = useRouter();
const states = ["New", "Active", "Resolved", "Closed"];
const workItemTypes = ["User Story", "Task", "Bug"];
const selectedOrganization = useCookie<string>("auzura:organization", {
  default: () => "",
});
const selectedProject = useCookie<string>("auzura:selected-project", {
  default: () => "",
});
const selectedItemId = ref<number | null>(null);
const isDetailOpen = ref(false);
const selectedTeam = useCookie<string>("auzura:selected-team", {
  default: () => "",
});
const selectedSprintPath = useCookie<string>("auzura:selected-sprint-path", {
  default: () => "",
});
const { loggedIn, user, fetch: refreshSession } = useUserSession();
const listPage = ref(1);
const itemsPerPageOptions = [25, 50, 100];
const itemsPerPage = ref(50);
const searchKeyword = ref("");
const assignedMembers = ref<string[]>([]);
const createdMembers = ref<string[]>([]);

const form = reactive({
  title: "",
  type: "Task",
  description: "",
  assignedTo: "",
  tags: "auzura",
});

const activeOrganization = computed(() => selectedOrganization.value.trim());
const organizationQuery = computed(() =>
  activeOrganization.value ?
    `organization=${encodeURIComponent(activeOrganization.value)}`
  : "",
);

function getRouteParam(value: unknown): string {
  return Array.isArray(value) ?
      String(value[0] || "").trim()
    : String(value || "").trim();
}

function withOrganizationQuery(path: string) {
  return `${path}${organizationQuery.value ? `&${organizationQuery.value}` : ""}`;
}

const routeProjectParams = computed(() => getRouteProjectParams(route.path));
const routeOrganization = computed(
  () =>
    routeProjectParams.value.organization ||
    getRouteParam(route.params.organization),
);
const routeProject = computed(() =>
  normalizeRouteProjectName(
    routeProjectParams.value.project || getRouteParam(route.params.project),
  ),
);
const routeTeam = computed(() => getRouteParam(route.query.team));
const routeSprint = computed(() => getRouteParam(route.query.sprint));
const activeSection = computed<SectionView>(() =>
  getProjectSectionFromPath(route.path),
);
const isAssetRequestRoute = computed(() => isKnownAssetRequestPath(route.path));
const routeProjectKey = computed(() =>
  routeOrganization.value && routeProject.value ?
    `${routeOrganization.value}/${routeProject.value}`
  : "",
);
const selectedProjectKey = computed(() =>
  activeOrganization.value && selectedProject.value ?
    `${activeOrganization.value}/${selectedProject.value}`
  : "",
);
const routeMatchesSelectedProject = computed(
  () =>
    !isProjectRoute(route.path) ||
    routeProjectKey.value === selectedProjectKey.value,
);
const resolvingDefaultOrganization = ref(false);

if (routeOrganization.value) {
  selectedOrganization.value = routeOrganization.value;
}

if (routeProject.value) {
  selectedProject.value = routeProject.value;
}

watch(
  [activeOrganization, loggedIn],
  async ([organization, isLoggedIn]) => {
    if (
      organization ||
      route.path === "/setup" ||
      resolvingDefaultOrganization.value
    )
      return;

    if (!isLoggedIn) {
      await router.replace("/setup");
      return;
    }

    resolvingDefaultOrganization.value = true;

    try {
      const response = await $fetch<{ organization: AzureOrganization | null }>(
        "/api/azure/default-organization",
      );

      if (response.organization?.slug) {
        selectedOrganization.value = response.organization.slug;
        return;
      }

      await router.replace("/setup");
    } catch {
      await router.replace("/setup");
    } finally {
      resolvingDefaultOrganization.value = false;
    }
  },
  { immediate: true },
);

const projectsUrl = computed(
  () =>
    `/api/azure/projects${organizationQuery.value ? `?${organizationQuery.value}` : ""}`,
);
const {
  data: projectsData,
  pending: projectsPending,
  error: projectsError,
  refresh: refreshProjects,
} = await useAsyncData<{ projects: AzureProject[] }>(
  () =>
    azureDataKey("projects", {
      organization: activeOrganization.value,
    }),
  () => $fetch(projectsUrl.value),
  {
    immediate: false,
    watch: [activeOrganization],
  },
);

const projects = computed(() => projectsData.value?.projects ?? []);
const projectOptions = computed(() =>
  projects.value.map((project) => project.name),
);
const activeProject = computed(
  () => selectedProject.value || projectOptions.value[0] || "",
);
const canQueryAzure = computed(() => loggedIn.value);
const canLoadAzure = computed(
  () => canQueryAzure.value && Boolean(activeOrganization.value),
);

const { data: organizationsData, refresh: refreshOrganizations } =
  await useAsyncData<{ organizations: AzureOrganization[] }>(
    azureDataKey("organizations"),
    () => $fetch("/api/azure/organizations"),
    {
      immediate: false,
    },
  );
const organizations = computed(
  () => organizationsData.value?.organizations ?? [],
);
const organizationOptions = computed(() =>
  organizations.value.map((organization) => organization.slug),
);
const organizationItems = computed(() => {
  const merged = new Map(
    organizations.value.map((organization) => [
      organization.slug,
      organization,
    ]),
  );
  if (activeOrganization.value && !merged.has(activeOrganization.value)) {
    merged.set(activeOrganization.value, {
      id: activeOrganization.value,
      name: activeOrganization.value,
      slug: activeOrganization.value,
    });
  }

  return Array.from(merged.values()).sort(
    (first, second) =>
      Number(Boolean(second.isDefault)) - Number(Boolean(first.isDefault)) ||
      first.slug.localeCompare(second.slug),
  );
});
const isAddOrganizationOpen = ref(false);
const newOrganization = ref("");
const addingOrganization = ref(false);
const settingDefaultOrganization = ref(false);

async function setCurrentOrganizationAsDefault() {
  if (!activeOrganization.value || settingDefaultOrganization.value) return;

  settingDefaultOrganization.value = true;
  try {
    await $fetch("/api/azure/default-organization" as string, {
      method: "POST",
      body: {
        organization: activeOrganization.value,
      },
    });
    await refreshOrganizations();
  } finally {
    settingDefaultOrganization.value = false;
  }
}

const organizationProjectMenuItems = computed<DropdownMenuItem[][]>(() => [
  organizationItems.value.map((organization) => ({
    label:
      organization.isDefault ?
        `${organization.slug} (default)`
      : organization.slug,
    icon: organization.isDefault ? "i-lucide-star" : "i-lucide-building-2",
    onSelect: () => {
      selectedOrganization.value = organization.slug;
      selectedProject.value = "";
    },
  })),
  projectOptions.value.map((project) => ({
    label: project,
    icon: "i-lucide-folder-kanban",
    onSelect: () => {
      selectedProject.value = project;
    },
  })),
  [
    {
      label: "Set current as default",
      icon: "i-lucide-star",
      disabled: !activeOrganization.value || settingDefaultOrganization.value,
      onSelect: async () => await setCurrentOrganizationAsDefault(),
    },
    {
      label: "Add organization",
      icon: "i-lucide-circle-plus",
      onSelect: () => {
        isAddOrganizationOpen.value = true;
      },
    },
  ],
]);

const usersUrl = computed(() => withOrganizationQuery("/api/azure/users?"));
const {
  data: usersData,
  pending: usersPending,
  error: usersError,
  refresh: refreshUsers,
} = await useAsyncData<{ users: AzureUser[] }>(
  () =>
    azureDataKey("users", {
      organization: activeOrganization.value,
    }),
  () => $fetch(usersUrl.value),
  {
    immediate: false,
    watch: [activeOrganization],
  },
);
const users = computed(() => usersData.value?.users ?? []);
const userOptions = computed(() =>
  users.value.map((azureUser) =>
    azureUser.email && azureUser.email !== azureUser.displayName ?
      `${azureUser.displayName} <${azureUser.email}>`
    : azureUser.displayName,
  ),
);

const teamsUrl = computed(() =>
  withOrganizationQuery(
    `/api/azure/teams?project=${encodeURIComponent(activeProject.value)}`,
  ),
);
const {
  data: teamsData,
  pending: teamsPending,
  refresh: refreshTeams,
} = await useAsyncData<{ teams: AzureTeam[] }>(
  () =>
    azureDataKey("teams", {
      organization: activeOrganization.value,
      project: activeProject.value,
    }),
  () => $fetch(teamsUrl.value),
  {
    immediate: false,
    watch: [activeOrganization, activeProject],
  },
);
const teams = computed(() => teamsData.value?.teams ?? []);
const teamOptions = computed(() => teams.value.map((team) => team.name));

const sprintsUrl = computed(() =>
  withOrganizationQuery(
    `/api/azure/sprints?project=${encodeURIComponent(activeProject.value)}&team=${encodeURIComponent(selectedTeam.value)}`,
  ),
);
const {
  data: sprintsData,
  pending: sprintsPending,
  refresh: refreshSprints,
} = await useAsyncData<{ sprints: AzureSprint[] }>(
  () =>
    azureDataKey("sprints", {
      organization: activeOrganization.value,
      project: activeProject.value,
      team: selectedTeam.value,
    }),
  () => $fetch(sprintsUrl.value),
  {
    immediate: false,
    watch: [activeOrganization, activeProject, selectedTeam],
  },
);
const sprints = computed(() => sprintsData.value?.sprints ?? []);
const sprintOptions = computed(() =>
  sprints.value.map((sprint) => sprint.path),
);
const selectedSprint = computed(() =>
  sprints.value.find((sprint) => sprint.path === selectedSprintPath.value),
);
const isSprintTaskView = computed(() => activeSection.value === "sprint-task");

function appendQuery(
  path: string,
  params: Record<string, string | number | string[] | undefined>,
) {
  const query = Object.entries(params)
    .flatMap(([key, value]) =>
      Array.isArray(value) ?
        value.map((item) => [key, item] as const)
      : [[key, value] as const],
    )
    .filter(([, value]) => value !== undefined && String(value).trim() !== "")
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");

  return query ? `${path}&${query}` : path;
}

const assignedFilterValue = computed(() =>
  assignedMembers.value.length ? assignedMembers.value : undefined,
);
const createdFilterValue = computed(() =>
  createdMembers.value.length ? createdMembers.value : undefined,
);

const sprintItemsUrl = computed(() =>
  withOrganizationQuery(
    appendQuery(
      `/api/azure/work-items?project=${encodeURIComponent(activeProject.value)}&iterationPath=${encodeURIComponent(selectedSprintPath.value)}`,
      {
        assignedTo: assignedFilterValue.value,
        createdBy: createdFilterValue.value,
        keyword: searchKeyword.value.trim(),
      },
    ),
  ),
);
const {
  data: sprintItemsData,
  pending: sprintItemsPending,
  refresh: refreshSprintItems,
} = await useFetch<{ items: AzureWorkItem[] }>(sprintItemsUrl, {
  immediate: false,
  watch: false,
});
const sprintItems = computed(() => sprintItemsData.value?.items ?? []);

function relationTargetId(relation: AzureWorkItemRelation): number | undefined {
  const match = relation.url?.match(/workItems\/(\d+)$/i);
  if (!match?.[1]) return undefined;

  const id = Number(match[1]);
  return Number.isFinite(id) ? id : undefined;
}

function relationItems(
  item: AzureWorkItem,
  relationType: string,
): AzureWorkItem[] {
  const relatedById = new Map(
    (item.relatedItems ?? []).map((relatedItem) => [
      relatedItem.id,
      relatedItem,
    ]),
  );

  return (item.relations ?? [])
    .filter((relation) => relation.rel === relationType)
    .map((relation) => {
      const id = relationTargetId(relation);
      return id ? relatedById.get(id) : undefined;
    })
    .filter((relatedItem): relatedItem is AzureWorkItem =>
      Boolean(relatedItem),
    );
}

function childItems(item: AzureWorkItem): AzureWorkItem[] {
  return relationItems(item, "System.LinkTypes.Hierarchy-Forward");
}

function relatedItems(item: AzureWorkItem): AzureWorkItem[] {
  return relationItems(item, "System.LinkTypes.Related");
}

function totalRelations(item: AzureWorkItem): number {
  return childItems(item).length + relatedItems(item).length;
}

const boardUrl = computed(() =>
  withOrganizationQuery(
    appendQuery(
      `/api/azure/work-items?project=${encodeURIComponent(activeProject.value)}`,
      {
        assignedTo: assignedFilterValue.value,
        createdBy: createdFilterValue.value,
        keyword: searchKeyword.value.trim(),
        offset: (listPage.value - 1) * itemsPerPage.value,
        limit: itemsPerPage.value,
      },
    ),
  ),
);

const {
  data: boardData,
  pending: boardPending,
  error: boardError,
  refresh: refreshBoard,
} = await useFetch<WorkItemListResponse>(boardUrl, {
  immediate: false,
  watch: false,
});

watch(
  [activeOrganization, canLoadAzure],
  async ([organization, canLoad], [previousOrganization]) => {
    if (previousOrganization && organization !== previousOrganization) {
      selectedProject.value = "";
      selectedTeam.value = "";
      selectedSprintPath.value = "";
    }

    if (!canLoad) {
      projectsData.value = undefined;
      projectsError.value = undefined;
      usersData.value = undefined;
      usersError.value = undefined;
      return;
    }

    await Promise.all([refreshProjects(), refreshUsers()]);
  },
  { immediate: true },
);

watch(
  [routeOrganization, routeProject, routeTeam, routeSprint],
  ([organization, project, team, sprint]) => {
    if (isAssetRequestRoute.value) return;

    if (organization && organization !== activeOrganization.value) {
      selectedOrganization.value = organization;
    }

    if (project && project !== selectedProject.value) {
      selectedProject.value = project;
    }

    if (isProjectRoute(route.path)) {
      const normalizedTeam = team || "";
      const normalizedSprint = sprint || "";

      if (normalizedTeam !== selectedTeam.value) {
        selectedTeam.value = normalizedTeam;
      }

      if (normalizedSprint !== selectedSprintPath.value) {
        selectedSprintPath.value = normalizedSprint;
      }
    }
  },
  { immediate: true },
);

function hasSameQuery(
  left: Record<string, unknown>,
  right: Record<string, string>,
): boolean {
  const leftEntries = Object.entries(left)
    .filter(([, value]) => typeof value === "string" && String(value).trim())
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b));

  const rightEntries = Object.entries(right)
    .filter(([, value]) => String(value).trim())
    .sort(([a], [b]) => a.localeCompare(b));

  if (leftEntries.length !== rightEntries.length) return false;

  return leftEntries.every(([key, value], index) => {
    const [targetKey, targetValue] = rightEntries[index] || [];
    return key === targetKey && value === targetValue;
  });
}

watch(
  [activeOrganization, selectedProject],
  async ([organization, project]) => {
    if (!organization || !project) return;
    const targetPath = buildProjectSectionPath(
      organization,
      project,
      activeSection.value,
    );
    const targetQuery = buildProjectStateQuery(route.query, {
      team: selectedTeam.value,
      sprint: selectedSprintPath.value,
    });
    if (!isProjectRoute(route.path)) return;

    const shouldNavigate =
      route.path !== targetPath || !hasSameQuery(route.query, targetQuery);

    if (shouldNavigate) {
      await navigateTo(
        { path: targetPath, query: targetQuery },
        { replace: true },
      );
    }
  },
);

watch(
  canQueryAzure,
  async (isLoggedIn) => {
    if (!isLoggedIn) {
      organizationsData.value = undefined;
      return;
    }

    await refreshOrganizations();
  },
  { immediate: true },
);

watch(
  projectOptions,
  (options) => {
    if (!canLoadAzure.value) return;

    if (routeProject.value && options.includes(routeProject.value)) {
      if (selectedProject.value !== routeProject.value) {
        selectedProject.value = routeProject.value;
      }
      return;
    }

    if (!selectedProject.value && options[0]) {
      selectedProject.value = options[0];
    }

    if (
      selectedProject.value &&
      options[0] &&
      !options.includes(selectedProject.value) &&
      !routeProject.value
    ) {
      selectedProject.value = options[0];
    }
  },
  { immediate: true },
);

watch(
  [activeProject, canLoadAzure],
  async ([project, canLoad], [previousProject]) => {
    if (previousProject && project !== previousProject) {
      selectedTeam.value = "";
      selectedSprintPath.value = "";
      teamsData.value = undefined;
      sprintsData.value = undefined;
      sprintItemsData.value = undefined;
    }

    if (
      !project ||
      !canLoad ||
      !routeMatchesSelectedProject.value ||
      (activeSection.value !== "tasks" && activeSection.value !== "sprint-task")
    ) {
      teamsData.value = undefined;
      sprintsData.value = undefined;
      sprintItemsData.value = undefined;
      return;
    }

    await refreshTeams();
    if (activeSection.value === "tasks") {
      await refreshBoard();
    }
  },
);

watch(
  teams,
  async (value) => {
    if (
      activeSection.value !== "sprint-task" ||
      !routeMatchesSelectedProject.value
    )
      return;
    if (!value.length) {
      selectedTeam.value = "";
      return;
    }

    if (
      !selectedTeam.value ||
      !value.some((team) => team.name === selectedTeam.value)
    ) {
      selectedTeam.value = value[0]?.name || "";
    }

    if (selectedTeam.value) {
      await refreshSprints();
    }
  },
  { immediate: true },
);

watch(
  [selectedTeam, activeProject, canLoadAzure],
  async ([team, project, canLoad]) => {
    if (
      !team ||
      !project ||
      !canLoad ||
      !routeMatchesSelectedProject.value ||
      activeSection.value !== "sprint-task"
    )
      return;
    await refreshSprints();
  },
);

watch(
  sprints,
  async (value) => {
    if (
      activeSection.value !== "sprint-task" ||
      !routeMatchesSelectedProject.value
    )
      return;
    if (!value.length) {
      selectedSprintPath.value = "";
      sprintItemsData.value = undefined;
      return;
    }

    const currentSprint = value.find(
      (sprint) => sprint.timeFrame === "current",
    );
    const fallback = currentSprint?.path || value[0]?.path || "";
    if (
      !selectedSprintPath.value ||
      !value.some((sprint) => sprint.path === selectedSprintPath.value)
    ) {
      selectedSprintPath.value = fallback;
    }

    if (selectedSprintPath.value && isSprintTaskView.value) {
      await refreshSprintItems();
    }
  },
  { immediate: true },
);

watch(
  [selectedSprintPath, activeProject, canLoadAzure, isSprintTaskView],
  async ([sprintPath, project, canLoad, isSprint]) => {
    if (
      !sprintPath ||
      !project ||
      !canLoad ||
      !isSprint ||
      !routeMatchesSelectedProject.value
    )
      return;
    await refreshSprintItems();
  },
);

watch(
  activeSection,
  async (section) => {
    if (
      (section !== "tasks" && section !== "sprint-task") ||
      !activeProject.value ||
      !canLoadAzure.value ||
      !routeMatchesSelectedProject.value
    )
      return;

    if (section === "sprint-task") {
      await refreshTeams();
      if (selectedTeam.value) await refreshSprints();
      if (selectedSprintPath.value) await refreshSprintItems();
      return;
    }

    if (section === "tasks") {
      await refreshTeams();
      await refreshBoard();
    }
  },
  { immediate: true },
);

watch([selectedTeam, selectedSprintPath], async ([team, sprint]) => {
  if (activeSection.value !== "tasks" && activeSection.value !== "sprint-task")
    return;
  if (!routeMatchesSelectedProject.value) return;
  const query = buildProjectStateQuery(route.query, { team, sprint });
  if (hasSameQuery(route.query, query)) return;
  await navigateTo({ path: route.path, query }, { replace: true });
});

const detailUrl = computed(() =>
  selectedItemId.value && activeProject.value ?
    withOrganizationQuery(
      `/api/azure/work-items/${selectedItemId.value}?project=${encodeURIComponent(activeProject.value)}`,
    )
  : null,
);

type WorkItemListResponse = {
  items: AzureWorkItem[];
  total: number;
  offset: number;
  limit: number;
};

type DashboardMetrics = {
  total: number;
  byState: Array<{ label: string; count: number; percent: number }>;
  byType: Array<{ label: string; count: number; percent: number }>;
  byAssignee: Array<{ label: string; count: number; percent: number }>;
  freshness: Array<{ label: string; count: number; percent: number }>;
  lastSyncedAt?: string;
};

const dashboardUrl = computed(() =>
  withOrganizationQuery(
    `/api/azure/dashboard?project=${encodeURIComponent(activeProject.value)}`,
  ),
);
const { data: dashboardData, refresh: refreshDashboard } = await useFetch<{
  metrics: DashboardMetrics;
}>(dashboardUrl, {
  immediate: false,
  watch: false,
});

const {
  data: detailData,
  pending: detailPending,
  refresh: refreshDetail,
} = await useFetch<{ item: AzureWorkItem }>(
  () => detailUrl.value || "/api/azure/work-items/0",
  {
    immediate: false,
    watch: false,
  },
);

let boardRefreshTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  [boardUrl, canLoadAzure, activeSection, routeMatchesSelectedProject],
  ([, isLoggedIn, section, matches]) => {
    if (!isLoggedIn || !activeProject.value || !matches || section !== "tasks") {
      return;
    }

    if (boardRefreshTimer) {
      clearTimeout(boardRefreshTimer);
    }

    boardRefreshTimer = setTimeout(async () => {
      await refreshBoard();
    }, 220);
  },
);

watch(
  [dashboardUrl, canLoadAzure, routeMatchesSelectedProject],
  async ([, isLoggedIn, matches]) => {
    if (!isLoggedIn || !activeProject.value || !matches) return;
    await refreshDashboard();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (boardRefreshTimer) {
    clearTimeout(boardRefreshTimer);
  }
});

watch(
  [searchKeyword, assignedMembers, createdMembers, activeProject, itemsPerPage],
  () => {
    listPage.value = 1;
  },
);

const dashboardMetrics = computed(() => dashboardData.value?.metrics);
const boardItems = computed(() => boardData.value?.items ?? []);
const listTotal = computed(() => boardData.value?.total ?? 0);
const listPageCount = computed(() =>
  Math.max(Math.ceil(listTotal.value / itemsPerPage.value), 1),
);
const canGoPrevious = computed(() => listPage.value > 1);
const canGoNext = computed(() => listPage.value < listPageCount.value);
const selectedItem = computed(
  () =>
    detailData.value?.item ||
    boardItems.value.find((item) => item.id === selectedItemId.value),
);
const busy = computed(
  () =>
    boardPending.value ||
    sprintItemsPending.value ||
    projectsPending.value ||
    usersPending.value,
);

function previousPage() {
  if (canGoPrevious.value) listPage.value -= 1;
}

function nextPage() {
  if (canGoNext.value) listPage.value += 1;
}

const assignedByState = computed(() =>
  states.map((state) => ({
    label: state,
    count: boardItems.value.filter((item) => item.state === state).length,
  })),
);

const dashboardStats = computed<
  Array<{
    title: string;
    icon: string;
    value: string | number;
    tone:
      | "primary"
      | "secondary"
      | "success"
      | "info"
      | "warning"
      | "error"
      | "neutral";
  }>
>(() => [
  {
    title: "Cached tasks",
    icon: "i-lucide-database",
    value: dashboardMetrics.value?.total ?? listTotal.value,
    tone: "primary",
  },
  {
    title: "This page",
    icon: "i-lucide-list-checks",
    value: boardItems.value.length,
    tone: "info",
  },
  {
    title: "Active project",
    icon: "i-lucide-folder-kanban",
    value: activeProject.value || "—",
    tone: "success",
  },
  {
    title: "Azure organization",
    icon: "i-lucide-building-2",
    value: activeOrganization.value || "—",
    tone: "neutral",
  },
]);

const chartSections = computed(() => [
  {
    title: "State breakdown",
    icon: "i-lucide-chart-no-axes-column",
    items: dashboardMetrics.value?.byState ?? [],
  },
  {
    title: "Work item types",
    icon: "i-lucide-shapes",
    items: dashboardMetrics.value?.byType ?? [],
  },
  {
    title: "Top assignees",
    icon: "i-lucide-users",
    items: dashboardMetrics.value?.byAssignee ?? [],
  },
  {
    title: "Freshness",
    icon: "i-lucide-clock-3",
    items: dashboardMetrics.value?.freshness ?? [],
  },
]);

async function goToSection(section: SectionView) {
  const targetPath = buildProjectSectionPath(
    activeOrganization.value,
    activeProject.value,
    section,
  );
  const targetQuery = buildProjectStateQuery(route.query, {
    team: selectedTeam.value,
    sprint: selectedSprintPath.value,
  });
  await navigateTo({ path: targetPath, query: targetQuery });
}

const viewNavigation = computed<NavigationMenuItem[][]>(() => [
  [
    {
      label: "Tasks",
      icon: "i-lucide-list-filter",
      badge: String(listTotal.value),
      active: activeSection.value === "tasks",
      onSelect: async () => await goToSection("tasks"),
    },
    {
      label: "Overview",
      icon: "i-lucide-chart-no-axes-column",
      active: activeSection.value === "report",
      onSelect: async () => await goToSection("report"),
    },
  ],
]);

const userMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: loggedIn.value ? "Switch account" : "Sign in",
      icon: "i-lucide-log-in",
      onSelect: async () => await loginWithMicrosoft(),
    },
    {
      label: "Sign out",
      icon: "i-lucide-log-out",
      disabled: !loggedIn.value,
      onSelect: async () => await logoutFromMicrosoft(),
    },
  ],
]);

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSprintRange(sprint?: AzureSprint): string {
  if (!sprint) return "No sprint selected";
  if (!sprint.startDate && !sprint.finishDate)
    return sprint.timeFrame || "No date range";
  const start = sprint.startDate ? formatDate(sprint.startDate) : "N/A";
  const finish = sprint.finishDate ? formatDate(sprint.finishDate) : "N/A";
  return `${start} - ${finish}`;
}

function stripHtml(value?: string) {
  if (!value) return "No description.";
  return (
    value
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "No description."
  );
}

function stateColor(state?: string) {
  if (state === "Closed") return "success";
  if (state === "Resolved") return "info";
  if (state === "Active") return "warning";
  if (state === "Released") return "success";
  return "neutral";
}

function formatNumberValue(value?: number) {
  return value === undefined || value === null ? "-" : String(value);
}

function isTaskWorkItem(item: AzureWorkItem): boolean {
  return item.type.trim().toLowerCase() === "task";
}

function storyPointLabel(item: AzureWorkItem): string {
  return isTaskWorkItem(item) ? "Estimated SP" : "Effort";
}

function storyPointValue(item: AzureWorkItem): number | undefined {
  return isTaskWorkItem(item) ?
      (item.estimatedStoryPoints ?? item.effort)
    : item.effort;
}

async function refreshCurrentView() {
  if (!canLoadAzure.value || !activeProject.value) return;
  if (activeSection.value === "sprint-task") {
    await refreshSprintItems();
  } else {
    await refreshBoard();
  }
  await refreshDashboard();
  if (selectedItemId.value) {
    await refreshDetail();
  }
}

async function createItem() {
  if (!activeProject.value) {
    toast.add({ title: "Pick a project first", color: "warning" });
    return;
  }

  if (!form.title.trim()) {
    toast.add({ title: "Title required", color: "warning" });
    return;
  }

  await $fetch(
    withOrganizationQuery(
      `/api/azure/work-items?project=${encodeURIComponent(activeProject.value)}`,
    ),
    {
      method: "POST",
      body: {
        title: form.title,
        type: form.type,
        description: form.description || undefined,
        assignedTo: form.assignedTo || undefined,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      },
    },
  );

  toast.add({
    title: "Work item created",
    description: activeProject.value,
    color: "success",
  });
  form.title = "";
  form.description = "";
  await refreshCurrentView();
}

async function moveItem(item: AzureWorkItem, state: string) {
  if (!activeProject.value || item.state === state) return;

  await $fetch(
    withOrganizationQuery(
      `/api/azure/work-items/${item.id}/state?project=${encodeURIComponent(activeProject.value)}`,
    ),
    {
      method: "PATCH",
      body: { state },
    },
  );

  toast.add({
    title: `Moved #${item.id} to ${state}`,
    description: activeProject.value,
    color: "success",
  });
  await refreshCurrentView();
}

async function loginWithMicrosoft() {
  await navigateTo("/api/auth/azure/login", { external: true });
}

async function logoutFromMicrosoft() {
  await $fetch("/api/auth/azure/logout", { method: "POST" });
  projectsData.value = undefined;
  projectsError.value = undefined;
  boardData.value = undefined;
  boardError.value = undefined;
  detailData.value = undefined;
  selectedProject.value = "";
  selectedItemId.value = null;
  isDetailOpen.value = false;
  await refreshSession();
  toast.add({ title: "Signed out", color: "success" });
}

async function openDetail(item: AzureWorkItem) {
  selectedItemId.value = item.id;
  isDetailOpen.value = true;
  await refreshDetail();
}

async function addOrganization() {
  const organization = newOrganization.value.trim();

  if (!organization) {
    toast.add({ title: "Organization is required", color: "warning" });
    return;
  }

  if (!loggedIn.value) {
    toast.add({ title: "Sign in with Microsoft first", color: "warning" });
    return;
  }

  addingOrganization.value = true;

  try {
    const response = await $fetch<{
      organization: string;
      projects: AzureProject[];
    }>("/api/azure/setup", {
      method: "POST",
      body: { organization },
    });

    const projects = response.projects ?? [];
    if (!projects.length) {
      toast.add({
        title: "Organization has no accessible projects",
        color: "warning",
      });
      return;
    }

    selectedOrganization.value = response.organization;
    selectedProject.value = projects[0]?.name || "";
    newOrganization.value = "";
    isAddOrganizationOpen.value = false;
    await refreshOrganizations();
    toast.add({
      title: "Organization added",
      description: response.organization,
      color: "success",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to add organization";
    toast.add({
      title: "Invalid organization",
      description: message,
      color: "error",
    });
  } finally {
    addingOrganization.value = false;
  }
}
</script>

<template>
  <UDashboardPanel id="auzura-main">
    <template #header>
      <UDashboardNavbar
        :title="activeProject || 'Azure Boards'"
        :ui="{ right: 'gap-2' }"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UBadge :color="loggedIn ? 'success' : 'warning'" variant="soft">
            {{ loggedIn ? "Microsoft connected" : "Login required" }}
          </UBadge>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            square
            :loading="busy"
            :disabled="!canLoadAzure || !activeProject"
            @click="refreshCurrentView()"
          />
          <UColorModeButton color="neutral" variant="ghost" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UButtonGroup>
            <UButton
              :icon="
                activeSection === 'sprint-task' ? 'i-lucide-list-tree'
                : activeSection === 'tasks' ? 'i-lucide-list-filter'
                : 'i-lucide-chart-no-axes-column'
              "
              color="primary"
              variant="subtle"
            >
              {{
                activeSection === "sprint-task" ? "Sprint Task"
                : activeSection === "tasks" ? "Tasks"
                : "Dashboard Overview"
              }}
            </UButton>
          </UButtonGroup>
        </template>

        <template #right>
          <USelectMenu
            v-model="selectedProject"
            :items="projectOptions"
            :loading="projectsPending"
            class="w-56"
            placeholder="Project"
            searchable
          />
          <UButton
            icon="i-lucide-plus"
            :disabled="!activeProject"
            @click="goToSection('tasks')"
          >
            New work item
          </UButton>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UAlert
          v-if="!loggedIn"
          color="warning"
          variant="soft"
          icon="i-lucide-circle-alert"
          title="Microsoft sign-in required"
          description="Auzura uses Microsoft OAuth before loading Azure DevOps content."
        />

        <UAlert
          v-if="projectsError"
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="Project list failed"
          :description="projectsError.message"
        />

        <UAlert
          v-if="boardError"
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="Azure DevOps request failed"
          :description="boardError.message"
        />

        <UAlert
          v-if="usersError"
          color="warning"
          variant="soft"
          icon="i-lucide-users-round"
          title="User list failed"
          :description="`${usersError.message}. Filter member masih bisa diketik manual.`"
        />

        <UPageGrid
          v-if="activeSection === 'report'"
          class="gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <UPageCard
            v-for="stat in dashboardStats"
            :key="stat.title"
            :icon="stat.icon"
            :title="stat.title"
            variant="subtle"
            :ui="{
              container: 'gap-y-1',
              wrapper: 'items-start',
              leading:
                'p-2 rounded-full bg-primary/10 ring ring-inset ring-primary/25',
              title: 'font-normal text-muted text-xs uppercase',
            }"
            class="min-h-0"
          >
            <div class="flex items-center gap-2">
              <span class="truncate text-xl font-semibold text-highlighted">
                {{ stat.value }}
              </span>
              <UBadge :color="stat.tone" variant="subtle" class="text-xs">
                live
              </UBadge>
            </div>
          </UPageCard>
        </UPageGrid>

        <UCard v-if="activeSection === 'report'" variant="subtle">
          <template #header>
            <div
              class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Dashboard graphics
                </h2>
                <p class="text-sm text-muted">
                  MongoDB Atlas cache{{
                    dashboardMetrics?.lastSyncedAt ?
                      ` · synced ${formatDate(dashboardMetrics.lastSyncedAt)}`
                    : " · refresh Tasks dulu buat seed data"
                  }}
                </p>
              </div>
              <UBadge color="neutral" variant="soft">MongoDB Atlas</UBadge>
            </div>
          </template>

          <div class="grid gap-4 lg:grid-cols-2">
            <div
              v-for="section in chartSections"
              :key="section.title"
              class="rounded-xl border border-default bg-default/40 p-4"
            >
              <div class="mb-4 flex items-center gap-2">
                <UIcon :name="section.icon" class="size-4 text-primary" />
                <h3 class="text-sm font-semibold text-highlighted">
                  {{ section.title }}
                </h3>
              </div>

              <div v-if="section.items.length" class="space-y-3">
                <div
                  v-for="item in section.items"
                  :key="item.label"
                  class="space-y-1.5"
                >
                  <div class="flex items-center justify-between gap-3 text-sm">
                    <span class="truncate text-toned">{{ item.label }}</span>
                    <span class="font-medium text-highlighted">{{
                      item.count
                    }}</span>
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-elevated">
                    <div
                      class="h-full rounded-full bg-primary transition-all"
                      :style="{ width: `${Math.max(item.percent, 4)}%` }"
                    />
                  </div>
                </div>
              </div>

              <p
                v-else
                class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted"
              >
                Belum ada cache. Refresh Tasks dulu buat populate MongoDB Atlas.
              </p>
            </div>
          </div>
        </UCard>

        <UCard
          v-if="activeSection === 'tasks' || activeSection === 'sprint-task'"
          variant="subtle"
        >
          <template #header>
            <div class="space-y-4">
              <div
                class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">Tasks</h2>
                  <p class="text-sm text-muted">
                    <template v-if="activeSection === 'sprint-task'">
                      {{ selectedSprint?.name || "No sprint selected" }} ·
                      {{ sprintItems.length }} PBI / story
                    </template>
                    <template v-else>
                      {{ listTotal }} item match in
                      {{ activeProject || "selected project" }}
                    </template>
                  </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <UButton
                    icon="i-lucide-refresh-cw"
                    :loading="
                      isSprintTaskView ? sprintItemsPending : boardPending
                    "
                    color="neutral"
                    variant="subtle"
                    :disabled="isSprintTaskView && !selectedSprintPath"
                    @click="
                      isSprintTaskView ? refreshSprintItems() : refreshBoard()
                    "
                  >
                    Refresh
                  </UButton>
                </div>
              </div>

              <div v-if="activeSection === 'sprint-task'" class="space-y-3">
                <div class="grid gap-3 lg:grid-cols-12">
                  <UFormField label="Search" class="lg:col-span-4">
                    <UInput
                      v-model="searchKeyword"
                      icon="i-lucide-search"
                      placeholder="Keyword, title, assignee, or #383"
                    />
                  </UFormField>

                  <UFormField label="Assignee" class="lg:col-span-4">
                    <UInputMenu
                      v-model="assignedMembers"
                      icon="i-lucide-user"
                      :items="userOptions"
                      :loading="usersPending"
                      placeholder="Anyone"
                      multiple
                      create-item
                    />
                  </UFormField>

                  <UFormField label="Reporter" class="lg:col-span-4">
                    <UInputMenu
                      v-model="createdMembers"
                      icon="i-lucide-user-pen"
                      :items="userOptions"
                      :loading="usersPending"
                      placeholder="Anyone"
                      multiple
                      create-item
                    />
                  </UFormField>
                </div>

                <div class="grid gap-3 md:grid-cols-2">
                  <UFormField label="Team">
                    <USelectMenu
                      v-model="selectedTeam"
                      :items="teamOptions"
                      :loading="teamsPending"
                      placeholder="Team"
                      class="w-full"
                      searchable
                    />
                  </UFormField>
                  <UFormField label="Sprint">
                    <USelectMenu
                      v-model="selectedSprintPath"
                      :items="sprintOptions"
                      :loading="sprintsPending"
                      :disabled="!selectedTeam"
                      placeholder="Sprint iteration"
                      class="w-full"
                      searchable
                    />
                  </UFormField>
                </div>
              </div>

              <div v-else class="grid gap-3 lg:grid-cols-12">
                <UFormField label="Search" class="lg:col-span-5">
                  <UInput
                    v-model="searchKeyword"
                    icon="i-lucide-search"
                    placeholder="Keyword, title, assignee, or #383"
                  />
                </UFormField>

                <UFormField label="Assignee" class="lg:col-span-3">
                  <UInputMenu
                    v-model="assignedMembers"
                    icon="i-lucide-user"
                    :items="userOptions"
                    :loading="usersPending"
                    placeholder="Anyone"
                    multiple
                    create-item
                  />
                </UFormField>

                <UFormField label="Reporter" class="lg:col-span-3">
                  <UInputMenu
                    v-model="createdMembers"
                    icon="i-lucide-user-pen"
                    :items="userOptions"
                    :loading="usersPending"
                    placeholder="Anyone"
                    multiple
                    create-item
                  />
                </UFormField>

                <UFormField label="Show" class="lg:col-span-1">
                  <USelect
                    v-model="itemsPerPage"
                    :items="itemsPerPageOptions"
                  />
                </UFormField>
              </div>
            </div>
          </template>

          <div v-if="activeSection === 'sprint-task'" class="space-y-3">
            <div v-if="sprintItemsPending" class="space-y-3">
              <USkeleton v-for="index in 4" :key="index" class="h-24" />
            </div>

            <div v-else-if="sprintItems.length" class="space-y-3">
              <UCollapsible
                v-for="item in sprintItems"
                :key="item.id"
                :default-open="false"
                class="rounded-xl border border-default bg-default/50"
              >
                <template #default="{ open }">
                  <button
                    class="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-elevated/40"
                  >
                    <div class="min-w-0 space-y-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <UBadge color="primary" variant="soft"
                          >AB#{{ item.id }}</UBadge
                        >
                        <UBadge color="neutral" variant="soft">{{
                          item.type
                        }}</UBadge>
                        <UBadge
                          :color="stateColor(item.state)"
                          variant="soft"
                          >{{ item.state }}</UBadge
                        >
                        <UBadge color="info" variant="soft">
                          Effort {{ formatNumberValue(item.effort) }}
                        </UBadge>
                        <UBadge
                          v-if="totalRelations(item)"
                          color="neutral"
                          variant="outline"
                        >
                          {{ totalRelations(item) }} linked
                        </UBadge>
                      </div>
                      <p
                        class="truncate text-sm font-semibold text-highlighted"
                      >
                        {{ item.title }}
                      </p>
                      <p class="truncate text-xs text-muted">
                        {{ item.assignedTo || "Unassigned" }} ·
                        {{ item.iterationPath || "No iteration" }}
                      </p>
                    </div>
                    <UIcon
                      :name="
                        open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
                      "
                      class="mt-1 size-4 text-muted"
                    />
                  </button>
                </template>

                <template #content>
                  <div class="space-y-4 border-t border-default p-4">
                    <div>
                      <h3
                        class="mb-2 text-xs font-semibold uppercase text-muted"
                      >
                        Child tasks
                      </h3>
                      <div v-if="childItems(item).length" class="space-y-2">
                        <div
                          v-for="child in childItems(item)"
                          :key="child.id"
                          class="flex items-center justify-between gap-3 rounded-lg border border-default bg-elevated/30 px-3 py-2"
                        >
                          <button
                            class="min-w-0 truncate text-left text-sm text-highlighted hover:text-primary"
                            @click="openDetail(child)"
                          >
                            AB#{{ child.id }} · {{ child.title }}
                          </button>
                          <div class="flex shrink-0 items-center gap-2">
                            <UBadge color="info" variant="soft">
                              SP {{ formatNumberValue(storyPointValue(child)) }}
                            </UBadge>
                            <UBadge color="neutral" variant="soft">{{
                              child.type
                            }}</UBadge>
                            <UBadge
                              :color="stateColor(child.state)"
                              variant="soft"
                              >{{ child.state }}</UBadge
                            >
                          </div>
                        </div>
                      </div>
                      <p
                        v-else
                        class="rounded-lg border border-dashed border-default p-3 text-sm text-muted"
                      >
                        No child task linked.
                      </p>
                    </div>

                    <div>
                      <h3
                        class="mb-2 text-xs font-semibold uppercase text-muted"
                      >
                        Related issues
                      </h3>
                      <div v-if="relatedItems(item).length" class="space-y-2">
                        <div
                          v-for="related in relatedItems(item)"
                          :key="related.id"
                          class="flex items-center justify-between gap-3 rounded-lg border border-default bg-elevated/30 px-3 py-2"
                        >
                          <button
                            class="min-w-0 truncate text-left text-sm text-highlighted hover:text-primary"
                            @click="openDetail(related)"
                          >
                            AB#{{ related.id }} · {{ related.title }}
                          </button>
                          <div class="flex shrink-0 items-center gap-2">
                            <UBadge color="neutral" variant="soft">{{
                              related.type
                            }}</UBadge>
                            <UBadge
                              :color="stateColor(related.state)"
                              variant="soft"
                              >{{ related.state }}</UBadge
                            >
                          </div>
                        </div>
                      </div>
                      <p
                        v-else
                        class="rounded-lg border border-dashed border-default p-3 text-sm text-muted"
                      >
                        No related issue linked.
                      </p>
                    </div>
                  </div>
                </template>
              </UCollapsible>
            </div>

            <p
              v-else
              class="rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted"
            >
              No PBI/story in this sprint yet.
            </p>
          </div>

          <div v-else class="overflow-hidden rounded-lg border border-default">
            <div
              class="grid grid-cols-[112px_minmax(280px,1fr)_140px_96px_170px_170px_150px_88px] items-center gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-[11px] font-medium uppercase text-muted"
            >
              <span>Issue Key</span>
              <span>Summary</span>
              <span>Type</span>
              <span>SP / Effort</span>
              <span>Assignee</span>
              <span>Reporter</span>
              <span>Updated</span>
              <span class="text-right">Open</span>
            </div>

            <div v-if="boardPending" class="space-y-2 p-3">
              <USkeleton v-for="index in 6" :key="index" class="h-12" />
            </div>

            <div v-else class="divide-y divide-default">
              <div
                v-for="item in boardItems"
                :key="item.id"
                class="grid grid-cols-[112px_minmax(280px,1fr)_140px_96px_170px_170px_150px_88px] items-center gap-2 px-3 py-2 hover:bg-elevated/40"
              >
                <button
                  class="truncate text-left text-xs font-medium text-primary hover:underline"
                  @click="openDetail(item)"
                >
                  AB#{{ item.id }}
                </button>

                <div class="min-w-0">
                  <button
                    class="w-full truncate text-left text-sm font-medium text-highlighted hover:text-primary"
                    @click="openDetail(item)"
                  >
                    {{ item.title }}
                  </button>
                  <p class="truncate text-xs text-muted">
                    {{
                      item.areaPath ||
                      item.iterationPath ||
                      "No area / iteration"
                    }}
                  </p>
                </div>

                <UBadge color="neutral" variant="soft" class="w-fit">
                  {{ item.type }}
                </UBadge>

                <p class="truncate text-sm text-toned">
                  {{ storyPointLabel(item) }}:
                  {{ formatNumberValue(storyPointValue(item)) }}
                </p>

                <p class="truncate text-sm text-toned">
                  {{ item.assignedTo || "Unassigned" }}
                </p>

                <p class="truncate text-sm text-toned">
                  {{ item.createdBy || "—" }}
                </p>

                <div class="space-y-1">
                  <p class="text-xs text-muted">
                    {{ formatDate(item.changedDate) }}
                  </p>
                  <USelectMenu
                    :model-value="item.state"
                    :items="states"
                    size="xs"
                    @update:model-value="moveItem(item, String($event))"
                  />
                </div>

                <div class="flex justify-end">
                  <UButton
                    icon="i-lucide-panel-right-open"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    square
                    @click="openDetail(item)"
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="activeSection === 'tasks'"
            class="mt-4 flex flex-col gap-3 border-t border-default pt-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p class="text-sm text-muted">
              Page {{ listPage }} of {{ listPageCount }} · {{ listTotal }} total
            </p>
            <div class="flex gap-2">
              <UButton
                icon="i-lucide-chevron-left"
                color="neutral"
                variant="subtle"
                :disabled="!canGoPrevious || boardPending"
                @click="previousPage()"
              >
                Previous
              </UButton>
              <UButton
                trailing-icon="i-lucide-chevron-right"
                color="neutral"
                variant="subtle"
                :disabled="!canGoNext || boardPending"
                @click="nextPage()"
              >
                Next
              </UButton>
            </div>
          </div>

          <p
            v-if="
              activeSection === 'tasks' &&
              !boardPending &&
              activeProject &&
              !boardItems.length
            "
            class="mt-4 rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted"
          >
            No work items match this filter.
          </p>
        </UCard>

        <template
          v-if="activeSection !== 'tasks' && activeSection !== 'sprint-task'"
        >
          <UCard variant="subtle">
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Quick create
                </h2>
                <p class="text-sm text-muted">
                  Creates inside
                  <span class="font-medium text-highlighted">{{
                    activeProject || "selected project"
                  }}</span>
                  using your Microsoft OAuth session.
                </p>
              </div>
            </template>

            <form
              class="grid gap-4 lg:grid-cols-12"
              @submit.prevent="createItem"
            >
              <UFormField label="Title" class="lg:col-span-4">
                <UInput
                  v-model="form.title"
                  icon="i-lucide-pencil"
                  placeholder="Fix flaky release checklist"
                  :disabled="!activeProject"
                />
              </UFormField>

              <UFormField label="Type" class="lg:col-span-2">
                <USelect
                  v-model="form.type"
                  :items="workItemTypes"
                  :disabled="!activeProject"
                />
              </UFormField>

              <UFormField label="Assigned to" class="lg:col-span-3">
                <UInput
                  v-model="form.assignedTo"
                  icon="i-lucide-user"
                  placeholder="name@company.com"
                  :disabled="!activeProject"
                />
              </UFormField>

              <UFormField label="Tags" class="lg:col-span-3">
                <UInput
                  v-model="form.tags"
                  icon="i-lucide-tags"
                  placeholder="auzura, dx"
                  :disabled="!activeProject"
                />
              </UFormField>

              <UFormField label="Description" class="lg:col-span-10">
                <UTextarea
                  v-model="form.description"
                  autoresize
                  placeholder="What should happen?"
                  :disabled="!activeProject"
                />
              </UFormField>

              <div class="flex items-end lg:col-span-2">
                <UButton
                  type="submit"
                  block
                  icon="i-lucide-plus"
                  :disabled="!activeProject"
                  >Create</UButton
                >
              </div>
            </form>
          </UCard>
        </template>
      </div>
    </template>
  </UDashboardPanel>

  <UModal
    v-model:open="isDetailOpen"
    :title="
      selectedItem ?
        `#${selectedItem.id} ${selectedItem.title}`
      : 'Work item detail'
    "
    :description="activeProject"
  >
    <template #body>
      <div v-if="detailPending" class="space-y-4">
        <USkeleton class="h-8" />
        <USkeleton class="h-40" />
      </div>

      <div v-else-if="selectedItem" class="space-y-5">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="neutral" variant="soft">{{
            selectedItem.type
          }}</UBadge>
          <UBadge :color="stateColor(selectedItem.state)" variant="soft">{{
            selectedItem.state
          }}</UBadge>
          <UBadge v-if="selectedItem.priority" color="warning" variant="soft"
            >P{{ selectedItem.priority }}</UBadge
          >
          <UBadge
            v-if="selectedItem.type === 'Task'"
            color="info"
            variant="soft"
          >
            {{ selectedItem.type === "Task" ? "SP" : "Effort" }}
            {{ formatNumberValue(selectedItem.estimatedStoryPoints) }}
          </UBadge>
          <UBadge v-else color="info" variant="soft">
            Effort {{ formatNumberValue(selectedItem.effort) }}
          </UBadge>
          <UBadge
            v-for="tag in selectedItem.tags"
            :key="tag"
            color="neutral"
            variant="outline"
            >{{ tag }}</UBadge
          >
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">Assigned to</p>
            <p class="text-sm text-highlighted">
              {{ selectedItem.assignedTo || "Unassigned" }}
            </p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">Changed</p>
            <p class="text-sm text-highlighted">
              {{ formatDate(selectedItem.changedDate) }}
            </p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">Area</p>
            <p class="text-sm text-highlighted">
              {{ selectedItem.areaPath || "—" }}
            </p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">Iteration</p>
            <p class="text-sm text-highlighted">
              {{ selectedItem.iterationPath || "—" }}
            </p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">
              {{ selectedItem.type === "Task" ? "SP" : "Effort" }}
            </p>
            <p class="text-sm text-highlighted">
              {{ formatNumberValue(selectedItem.estimatedStoryPoints) }}
            </p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">Effort</p>
            <p class="text-sm text-highlighted">
              {{ formatNumberValue(selectedItem.effort) }}
            </p>
          </div>
        </div>

        <UFormField label="Status">
          <USelectMenu
            :model-value="selectedItem.state"
            :items="states"
            @update:model-value="moveItem(selectedItem, String($event))"
          />
        </UFormField>

        <div class="space-y-2">
          <h3 class="font-semibold text-highlighted">Description</h3>
          <p
            class="whitespace-pre-wrap rounded-lg border border-default bg-elevated/40 p-4 text-sm leading-6 text-toned"
          >
            {{ stripHtml(selectedItem.description) }}
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-between gap-3">
        <UButton
          v-if="selectedItem?.webUrl"
          :to="selectedItem.webUrl"
          target="_blank"
          icon="i-lucide-external-link"
          color="neutral"
          variant="subtle"
        >
          Open in Azure
        </UButton>
        <UButton color="neutral" variant="ghost" @click="isDetailOpen = false"
          >Close</UButton
        >
      </div>
    </template>
  </UModal>
</template>
