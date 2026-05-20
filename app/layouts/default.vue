<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";
import type {
  AzureOrganization,
  AzureProject,
  AzureSprint,
  AzureTeam,
  AzureWorkItem,
} from "~/types/azure-devops";

import {
  buildProjectSectionPath,
  getProjectSectionFromPath,
  type ProjectSection,
} from "~/utils/navigation";

type SectionView = ProjectSection;

const route = useRoute();
const router = useRouter();
const selectedOrganization = useCookie<string>("auzura:organization", {
  default: () => "",
});
const selectedProject = useCookie<string>("auzura:selected-project", {
  default: () => "",
});
const selectedTeam = useCookie<string>("auzura:selected-team", {
  default: () => "",
});
const selectedSprintPath = useCookie<string>("auzura:selected-sprint-path", {
  default: () => "",
});
const { loggedIn, user, fetch: refreshSession } = useUserSession();

const activeOrganization = computed(() => selectedOrganization.value.trim());
const organizationQuery = computed(() =>
  activeOrganization.value ?
    `organization=${encodeURIComponent(activeOrganization.value)}`
  : "",
);
const activeProject = computed(() => selectedProject.value.trim());
const canLoadAzure = computed(
  () => loggedIn.value && Boolean(activeOrganization.value),
);

function getRouteParam(value: unknown): string {
  return Array.isArray(value) ?
      String(value[0] || "").trim()
    : String(value || "").trim();
}

function withOrganizationQuery(path: string) {
  return `${path}${organizationQuery.value ? `&${organizationQuery.value}` : ""}`;
}

const routeOrganization = computed(() =>
  getRouteParam(route.params.organization),
);
const routeProject = computed(() => getRouteParam(route.params.project));
const activeSection = computed<SectionView>(() =>
  getProjectSectionFromPath(route.path),
);

watch(
  [routeOrganization, routeProject],
  ([organization, project]) => {
    if (organization && organization !== activeOrganization.value)
      selectedOrganization.value = organization;
    if (project && project !== selectedProject.value)
      selectedProject.value = project;
  },
  { immediate: true },
);

watch(
  [activeOrganization, selectedProject],
  async ([organization, project]) => {
    if (!organization) return;
    const targetPath = buildProjectSectionPath(
      organization,
      project || "",
      activeSection.value,
    );
    if (route.path !== targetPath) await router.replace(targetPath);
  },
);

const projectsUrl = computed(
  () =>
    `/api/azure/projects${organizationQuery.value ? `?${organizationQuery.value}` : ""}`,
);
const {
  data: projectsData,
  pending: projectsPending,
  refresh: refreshProjects,
} = await useFetch<{ projects: AzureProject[] }>(projectsUrl, {
  immediate: false,
  watch: false,
});
const projectOptions = computed(() =>
  (projectsData.value?.projects ?? []).map((project) => project.name),
);

const { data: organizationsData, refresh: refreshOrganizations } =
  await useFetch<{ organizations: AzureOrganization[] }>(
    "/api/azure/organizations",
    { immediate: false, watch: false },
  );
const organizationItems = computed(() => {
  const merged = new Set(
    (organizationsData.value?.organizations ?? []).map(
      (organization) => organization.slug,
    ),
  );
  if (activeOrganization.value) merged.add(activeOrganization.value);
  return Array.from(merged).sort((a, b) => a.localeCompare(b));
});

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
const teamOptions = computed(() =>
  (teamsData.value?.teams ?? []).map((team) => team.name),
);

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
const sprintOptions = computed(() =>
  sprints.value.map((sprint) => sprint.path),
);
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
  canLoadAzure,
  async (ready) => {
    if (!ready) return;
    await Promise.all([refreshOrganizations(), refreshProjects()]);
  },
  { immediate: true },
);

watch(
  [activeProject, canLoadAzure],
  async ([project, canLoad]) => {
    if (!project || !canLoad) return;
    await refreshTeams();
  },
  { immediate: true },
);

watch(
  teamOptions,
  async (options) => {
    if (!options.length) return;
    if (!selectedTeam.value || !options.includes(selectedTeam.value))
      selectedTeam.value = options[0] || "";
    if (selectedTeam.value) await refreshSprints();
  },
  { immediate: true },
);

watch(
  [selectedTeam, activeProject, canLoadAzure],
  async ([team, project, canLoad]) => {
    if (!team || !project || !canLoad) return;
    await refreshSprints();
  },
);

watch(
  sprints,
  async (value) => {
    if (!value.length) return;
    const current = value.find((sprint) => sprint.timeFrame === "current");
    if (
      !selectedSprintPath.value ||
      !value.some((sprint) => sprint.path === selectedSprintPath.value)
    ) {
      selectedSprintPath.value = current?.path || value[0]?.path || "";
    }
    if (selectedSprintPath.value) await refreshSprintItems();
  },
  { immediate: true },
);

const isAddOrganizationOpen = ref(false);
const newOrganization = ref("");
const addingOrganization = ref(false);

async function addOrganization() {
  const organization = newOrganization.value.trim();
  if (!organization || !loggedIn.value) return;
  addingOrganization.value = true;
  try {
    const response = await $fetch<{
      organization: string;
      projects: AzureProject[];
    }>("/api/azure/setup", { method: "POST", body: { organization } });
    if (!response.projects?.length) return;
    selectedOrganization.value = response.organization;
    selectedProject.value = response.projects[0]?.name || "";
    newOrganization.value = "";
    isAddOrganizationOpen.value = false;
    await refreshOrganizations();
  } finally {
    addingOrganization.value = false;
  }
}

async function loginWithMicrosoft() {
  await navigateTo("/api/auth/azure/login", { external: true });
}

async function logoutFromMicrosoft() {
  await $fetch("/api/auth/azure/logout", { method: "POST" });
  selectedProject.value = "";
  await refreshSession();
}

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
  [
    {
      label: "Add organization",
      icon: "i-lucide-circle-plus",
      onSelect: () => {
        isAddOrganizationOpen.value = true;
      },
    },
  ],
]);

async function goToSection(section: SectionView) {
  const targetPath = buildProjectSectionPath(
    activeOrganization.value,
    selectedProject.value || "",
    section,
  );
  if (route.path !== targetPath) await router.replace(targetPath);
}

const viewNavigation = computed<NavigationMenuItem[][]>(() => {
  const teamsGroup: NavigationMenuItem[] = [
    { label: "Sprints", type: "label" },
  ];

  for (const team of teamOptions.value) {
    const isSelected = selectedTeam.value === team;
    const teamItem: NavigationMenuItem = {
      label: team,
      icon: "i-lucide-users",
      defaultOpen: isSelected,
      onSelect: () => {
        selectedTeam.value = team;
      },
    };
    if (isSelected && sprintOptions.value.length) {
      teamItem.children = sprintOptions.value.map((sprintPath) => {
        const name = sprintPath.split("\\").pop() || sprintPath;
        const isCurrent = selectedSprintPath.value === sprintPath;
        return {
          label: name,
          icon:
            isCurrent ? "i-lucide-calendar-check" : "i-lucide-calendar-range",
          onSelect: () => {
            selectedSprintPath.value = sprintPath;
          },
        };
      });
    }
    teamsGroup.push(teamItem);
  }

  const sprintTaskGroup: NavigationMenuItem[] = [];
  if (selectedSprint.value) {
    sprintTaskGroup.push({
      label: "Sprint",
      type: "label",
    });
    sprintTaskGroup.push({
      label: "Sprint Task",
      icon: "i-lucide-list-tree",
      badge: String(sprintItems.value.length),
      active: activeSection.value === "sprint-task",
      onSelect: async () => await goToSection("sprint-task"),
    });
  }

  return [
    [
      {
        label: "All Task",
        icon: "i-lucide-list-filter",
        active: activeSection.value === "tasks",
        onSelect: async () => await goToSection("tasks"),
      },
      {
        label: "Overview",
        icon: "i-lucide-chart-no-axes-column",
        active: activeSection.value === "report",
        onSelect: async () => await goToSection("report"),
      },
      {
        label: "Settings",
        icon: "i-lucide-settings-2",
        active: activeSection.value === "settings",
        onSelect: async () => await goToSection("settings"),
      },
    ],
    ...(teamOptions.value.length ? [teamsGroup] : []),
    ...(sprintTaskGroup.length ? [sprintTaskGroup] : []),
  ];
});
</script>

<template>
  <UDashboardGroup storage="local" storage-key="auzura-dashboard" unit="rem">
    <UDashboardSidebar
      id="auzura-sidebar"
      collapsible
      resizable
      class="bg-elevated/40"
    >
      <template #header="{ collapsed }">
        <SidebarWorkspaceMenuCard
          v-if="!collapsed"
          :active-organization="activeOrganization"
          :items="organizationProjectMenuItems"
        />
      </template>
      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="viewNavigation"
          orientation="vertical"
          tooltip
          class="mt-3"
        />
      </template>
      <template #footer="{ collapsed }">
        <SidebarUserMenuCard
          :logged-in="loggedIn"
          :display-name="user?.displayName"
          :email="user?.email"
          :avatar-url="user?.image"
          :items="userMenuItems"
          :collapsed="collapsed"
        />
      </template>
    </UDashboardSidebar>
    <slot />
    <UModal v-model:open="isAddOrganizationOpen" title="Add organization">
      <template #body>
        <UFormField
          label="Organization slug"
          help="Will be validated by fetching project list."
        >
          <UInput
            v-model="newOrganization"
            icon="i-lucide-building-2"
            placeholder="your-azure-org"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="isAddOrganizationOpen = false"
            >Cancel</UButton
          >
          <UButton
            color="primary"
            :loading="addingOrganization"
            @click="addOrganization"
            >Validate and add</UButton
          >
        </div>
      </template>
    </UModal>
  </UDashboardGroup>
</template>
