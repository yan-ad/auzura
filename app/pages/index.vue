<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";
import type {
  AzureOrganization,
  AzureProject,
  AzureSprint,
  AzureTeam,
  AzureUser,
  AzureWorkItem,
} from "~/types/azure-devops";

type IdentityFilterMode = "anyone" | "me" | "members";
type SectionView = "tasks" | "report";
definePageMeta({ layout: "dashboard" });

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
const selectedTeam = useCookie<string>("auzura:selected-team", { default: () => "" });
const selectedSprintPath = useCookie<string>("auzura:selected-sprint-path", { default: () => "" });
const { loggedIn, user, fetch: refreshSession } = useUserSession();
const filterModes = [
  { label: "Anyone", value: "anyone" },
  { label: "Me", value: "me" },
  { label: "Members", value: "members" },
];
const listPage = ref(1);
const itemsPerPageOptions = [25, 50, 100];
const itemsPerPage = ref(50);
const searchKeyword = ref("");
const assignedFilterMode = ref<IdentityFilterMode>("anyone");
const assignedMembers = ref<string[]>([]);
const createdFilterMode = ref<IdentityFilterMode>("anyone");
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

function getSectionFromPath(path: string): SectionView {
  if (path.endsWith("/report")) return "report";
  return "tasks";
}

function buildRoutePath(
  organization: string,
  project: string,
  section: SectionView = "tasks",
): string {
  const org = organization.trim();
  const proj = project.trim();
  if (!org) return "/";
  if (!proj) return `/${encodeURIComponent(org)}`;
  return `/${encodeURIComponent(org)}/${encodeURIComponent(proj)}/${section}`;
}

const routeOrganization = computed(() =>
  getRouteParam(route.params.organization),
);
const routeProject = computed(() => getRouteParam(route.params.project));
const activeSection = computed<SectionView>(() =>
  getSectionFromPath(route.path),
);

if (routeOrganization.value) {
  selectedOrganization.value = routeOrganization.value;
}

if (routeProject.value) {
  selectedProject.value = routeProject.value;
}

watch(
  activeOrganization,
  async (organization) => {
    if (organization || route.path === "/setup") return;
    await router.replace("/setup");
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
} = await useFetch<{ projects: AzureProject[] }>(projectsUrl, {
  immediate: false,
  watch: false,
});

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
  await useFetch<{ organizations: AzureOrganization[] }>(
    "/api/azure/organizations",
    {
      immediate: false,
      watch: false,
    },
  );
const organizationOptions = computed(() =>
  (organizationsData.value?.organizations ?? []).map(
    (organization) => organization.slug,
  ),
);
const organizationItems = computed(() => {
  const merged = new Set<string>(organizationOptions.value);
  if (activeOrganization.value) {
    merged.add(activeOrganization.value);
  }

  return Array.from(merged).sort((first, second) => first.localeCompare(second));
});
const isAddOrganizationOpen = ref(false);
const newOrganization = ref("");
const addingOrganization = ref(false);
const organizationProjectMenuItems = computed<DropdownMenuItem[][]>(() => [
  organizationItems.value.map((organization) => ({
    label: organization,
    icon: "i-lucide-building-2",
    onSelect: () => {
      selectedOrganization.value = organization;
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
  [{
    label: "Add organization",
    icon: "i-lucide-circle-plus",
    onSelect: () => {
      isAddOrganizationOpen.value = true;
    },
  }],
]);

const usersUrl = computed(() => withOrganizationQuery("/api/azure/users?"));
const {
  data: usersData,
  pending: usersPending,
  error: usersError,
  refresh: refreshUsers,
} = await useFetch<{ users: AzureUser[] }>(usersUrl, {
  immediate: false,
  watch: false,
});
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
} = await useFetch<{ teams: AzureTeam[] }>(teamsUrl, {
  immediate: false,
  watch: false,
});
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
} = await useFetch<{ sprints: AzureSprint[] }>(sprintsUrl, {
  immediate: false,
  watch: false,
});
const sprints = computed(() => sprintsData.value?.sprints ?? []);
const sprintOptions = computed(() => sprints.value.map((sprint) => sprint.path));
const selectedSprint = computed(() =>
  sprints.value.find((sprint) => sprint.path === selectedSprintPath.value),
);

const sprintItemsUrl = computed(() =>
  withOrganizationQuery(
    `/api/azure/sprints/work-items?project=${encodeURIComponent(activeProject.value)}&iterationPath=${encodeURIComponent(selectedSprintPath.value)}`,
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

watch(
  [activeOrganization, canLoadAzure],
  async ([, canLoad]) => {
    selectedProject.value = "";

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
  [routeOrganization, routeProject],
  ([organization, project]) => {
    if (organization !== activeOrganization.value) {
      selectedOrganization.value = organization;
    }

    if (project && project !== selectedProject.value) {
      selectedProject.value = project;
    }
  },
  { immediate: true },
);

watch(
  [activeOrganization, selectedProject],
  async ([organization, project]) => {
    const targetPath = buildRoutePath(
      organization,
      project || "",
      activeSection.value,
    );
    if (route.path !== targetPath) {
      await router.replace(targetPath);
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

    if (!selectedProject.value && options[0]) {
      selectedProject.value = options[0];
    }

    if (
      selectedProject.value &&
      options[0] &&
      !options.includes(selectedProject.value)
    ) {
      selectedProject.value = options[0];
    }
  },
  { immediate: true },
);

watch([activeProject, canLoadAzure], async ([project, canLoad]) => {
  if (!project || !canLoad) {
    teamsData.value = undefined;
    sprintsData.value = undefined;
    sprintItemsData.value = undefined;
    selectedTeam.value = "";
    selectedSprintPath.value = "";
    return;
  }

  await refreshTeams();
});

watch(teams, async (value) => {
  if (!value.length) {
    selectedTeam.value = "";
    return;
  }

  if (!selectedTeam.value || !value.some((team) => team.name === selectedTeam.value)) {
    selectedTeam.value = value[0]?.name || "";
  }

  if (selectedTeam.value) {
    await refreshSprints();
  }
}, { immediate: true });

watch([selectedTeam, activeProject, canLoadAzure], async ([team, project, canLoad]) => {
  if (!team || !project || !canLoad) return;
  await refreshSprints();
});

watch(sprints, async (value) => {
  if (!value.length) {
    selectedSprintPath.value = "";
    sprintItemsData.value = undefined;
    return;
  }

  const currentSprint = value.find((sprint) => sprint.timeFrame === "current");
  const fallback = currentSprint?.path || value[0]?.path || "";
  if (!selectedSprintPath.value || !value.some((sprint) => sprint.path === selectedSprintPath.value)) {
    selectedSprintPath.value = fallback;
  }

  if (selectedSprintPath.value) {
    await refreshSprintItems();
  }
}, { immediate: true });

watch([selectedSprintPath, activeProject, canLoadAzure], async ([sprintPath, project, canLoad]) => {
  if (!sprintPath || !project || !canLoad) return;
  await refreshSprintItems();
});

function withOrganizationQuery(path: string) {
  return `${path}${organizationQuery.value ? `&${organizationQuery.value}` : ""}`;
}

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

const assignedFilterValue = computed(() => {
  if (assignedFilterMode.value === "me") return ["me"];
  if (assignedFilterMode.value === "members") return assignedMembers.value;
  return undefined;
});
const createdFilterValue = computed(() => {
  if (createdFilterMode.value === "me") return ["me"];
  if (createdFilterMode.value === "members") return createdMembers.value;
  return undefined;
});

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

const {
  data: boardData,
  pending: boardPending,
  error: boardError,
  refresh: refreshBoard,
} = await useFetch<WorkItemListResponse>(boardUrl, {
  immediate: false,
  watch: false,
});

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

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

function queueRefresh(scope: "all" | "dashboard" = "all", wait = 350) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  refreshTimer = setTimeout(async () => {
    if (!canLoadAzure.value || !activeProject.value) return;

    if (scope === "all" || activeSection.value === "tasks") {
      await refreshBoard();
    }

    await refreshDashboard();
  }, wait);
}

watch(
  [activeProject, canLoadAzure, activeSection],
  ([project, isLoggedIn, section]) => {
    if (!project || !isLoggedIn) return;
    queueRefresh(section === "report" ? "dashboard" : "all", 0);
  },
  { immediate: true },
);

watch(
  [
    searchKeyword,
    assignedFilterMode,
    assignedMembers,
    createdFilterMode,
    createdMembers,
    activeProject,
    itemsPerPage,
  ],
  () => {
    listPage.value = 1;
  },
);

watch([boardUrl, canLoadAzure], ([, isLoggedIn]) => {
  if (activeProject.value && isLoggedIn) {
    queueRefresh("all");
  }
});

watch([dashboardUrl, canLoadAzure], ([, isLoggedIn]) => {
  if (activeProject.value && isLoggedIn) {
    queueRefresh("dashboard");
  }
});

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
  () => boardPending.value || projectsPending.value || usersPending.value,
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
  const targetPath = buildRoutePath(
    activeOrganization.value,
    selectedProject.value || "",
    section,
  );
  if (route.path !== targetPath) {
    await router.replace(targetPath);
  }
}

const viewNavigation = computed<NavigationMenuItem[][]>(() => [
  [
    {
      label: "All Task",
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

const userMenuItems = computed<DropdownMenuItem[][]>(() => [[
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
]]);

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSprintRange(sprint?: AzureSprint): string {
  if (!sprint) return "No sprint selected";
  if (!sprint.startDate && !sprint.finishDate) return sprint.timeFrame || "No date range";
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
  return "neutral";
}

async function refreshCurrentView() {
  if (!canLoadAzure.value || !activeProject.value) return;
  await refreshBoard();
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
    const response = await $fetch<{ organization: string; projects: AzureProject[] }>(
      "/api/azure/setup",
      {
        method: "POST",
        body: { organization },
      },
    );

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
    const message = error instanceof Error ? error.message : "Failed to add organization";
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
                  activeSection === 'tasks' ?
                    'i-lucide-list-filter'
                  : 'i-lucide-chart-no-axes-column'
                "
                color="primary"
                variant="subtle"
              >
                {{
                  activeSection === "tasks" ? "All Task" : "Dashboard Overview"
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

          <UPageGrid v-if="activeSection === 'report'" class="gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                      : " · refresh All Task dulu buat seed data"
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
                    <div
                      class="flex items-center justify-between gap-3 text-sm"
                    >
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
                  Belum ada cache. Refresh All Task dulu buat populate MongoDB
                  Atlas.
                </p>
              </div>
            </div>
          </UCard>

          <UCard v-if="activeSection === 'tasks'" variant="subtle">
            <template #header>
              <div class="space-y-4">
                <div
                  class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <h2 class="text-lg font-semibold text-highlighted">
                      All Task
                    </h2>
                    <p class="text-sm text-muted">
                      {{ listTotal }} item match in
                      {{ activeProject || "selected project" }}
                    </p>
                  </div>
                  <UButton
                    icon="i-lucide-refresh-cw"
                    :loading="boardPending"
                    color="neutral"
                    variant="subtle"
                    @click="refreshBoard()"
                  >
                    Refresh list
                  </UButton>
                </div>

                <div class="grid gap-3 lg:grid-cols-12">
                  <UFormField label="Search" class="lg:col-span-3">
                    <UInput
                      v-model="searchKeyword"
                      icon="i-lucide-search"
                      placeholder="Keyword atau #383"
                    />
                  </UFormField>

                  <UFormField label="Per page" class="lg:col-span-2">
                    <USelect
                      v-model="itemsPerPage"
                      :items="itemsPerPageOptions"
                    />
                  </UFormField>

                  <UFormField label="Assigned to" class="lg:col-span-3">
                    <div class="flex gap-2">
                      <USelect
                        v-model="assignedFilterMode"
                        :items="filterModes"
                        class="w-32"
                      />
                      <UInputMenu
                        v-model="assignedMembers"
                        icon="i-lucide-user"
                        :items="userOptions"
                        :loading="usersPending"
                        placeholder="choose members"
                        :disabled="assignedFilterMode !== 'members'"
                        multiple
                        create-item
                      />
                    </div>
                  </UFormField>

                  <UFormField label="Created by" class="lg:col-span-4">
                    <div class="flex gap-2">
                      <USelect
                        v-model="createdFilterMode"
                        :items="filterModes"
                        class="w-32"
                      />
                      <UInputMenu
                        v-model="createdMembers"
                        icon="i-lucide-user-pen"
                        :items="userOptions"
                        :loading="usersPending"
                        placeholder="choose members"
                        :disabled="createdFilterMode !== 'members'"
                        multiple
                        create-item
                      />
                    </div>
                  </UFormField>
                </div>
              </div>
            </template>

            <div class="overflow-x-auto">
              <table class="w-full min-w-[980px] text-left text-sm">
                <thead
                  class="border-b border-default text-xs uppercase tracking-wide text-muted"
                >
                  <tr>
                    <th class="px-3 py-3">Key</th>
                    <th class="px-3 py-3">Title</th>
                    <th class="px-3 py-3">Type</th>
                    <th class="px-3 py-3">Assigned</th>
                    <th class="px-3 py-3">Created</th>
                    <th class="px-3 py-3">Updated</th>
                    <th class="px-3 py-3">Status</th>
                    <th class="px-3 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-if="boardPending" v-for="index in 5" :key="index">
                    <td colspan="8" class="px-3 py-4">
                      <USkeleton class="h-8" />
                    </td>
                  </tr>
                  <tr
                    v-for="item in boardItems"
                    v-else
                    :key="item.id"
                    class="hover:bg-elevated/50"
                  >
                    <td class="whitespace-nowrap px-3 py-4 text-muted">
                      #{{ item.id }}
                    </td>
                    <td class="px-3 py-4">
                      <button
                        class="max-w-md truncate text-left font-medium text-highlighted hover:text-primary"
                        @click="openDetail(item)"
                      >
                        {{ item.title }}
                      </button>
                      <p class="mt-1 truncate text-xs text-muted">
                        {{ item.areaPath || "No area" }}
                      </p>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4">
                      <UBadge color="neutral" variant="soft">{{
                        item.type
                      }}</UBadge>
                    </td>
                    <td class="max-w-48 truncate px-3 py-4 text-toned">
                      {{ item.assignedTo || "Unassigned" }}
                    </td>
                    <td class="max-w-48 truncate px-3 py-4 text-toned">
                      {{ item.createdBy || "—" }}
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-muted">
                      {{ formatDate(item.changedDate) }}
                    </td>
                    <td class="min-w-40 px-3 py-4">
                      <USelectMenu
                        :model-value="item.state"
                        :items="states"
                        size="xs"
                        @update:model-value="moveItem(item, String($event))"
                      />
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-right">
                      <UButton
                        icon="i-lucide-panel-right-open"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        @click="openDetail(item)"
                      >
                        Detail
                      </UButton>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              class="mt-4 flex flex-col gap-3 border-t border-default pt-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <p class="text-sm text-muted">
                Page {{ listPage }} of {{ listPageCount }} ·
                {{ listTotal }} total
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
              v-if="!boardPending && activeProject && !boardItems.length"
              class="mt-4 rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted"
            >
              No work items match this filter.
            </p>
          </UCard>

          <template>
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
