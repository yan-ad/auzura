<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";
import type { AzureOrganization, AzureProject } from "~/types/azure-devops";

import {
  buildProjectSectionRoute,
  getProjectSectionFromPath,
  getRouteProjectParams,
  isProjectRoute,
  normalizeRouteProjectName,
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
const sidebarTeamsUrl = computed(
  () =>
    `/api/azure/sidebar-teams${organizationQuery.value ? `?${organizationQuery.value}` : ""}`,
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
const isGlobalSettingsRoute = computed(() => route.path === "/settings");

watch(
  [routeOrganization, routeProject, routeTeam, routeSprint],
  ([organization, project, team, sprint]) => {
    if (organization && organization !== activeOrganization.value)
      selectedOrganization.value = organization;
    if (project && project !== selectedProject.value)
      selectedProject.value = project;
    if (team && team !== selectedTeam.value) selectedTeam.value = team;
    if (sprint && sprint !== selectedSprintPath.value)
      selectedSprintPath.value = sprint;
  },
  { immediate: true },
);

watch(
  [activeOrganization, selectedProject],
  async ([organization, project]) => {
    if (isGlobalSettingsRoute.value) return;
    if (!organization || !project) return;
    const targetRoute = buildProjectSectionRoute(
      route.query,
      organization,
      project,
      activeSection.value,
      {
        team: selectedTeam.value,
        sprint: selectedSprintPath.value,
      },
    );
    if (isProjectRoute(route.path) && route.path !== targetRoute.path) {
      await router.replace(targetRoute);
    }
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
const organizations = computed(
  () => organizationsData.value?.organizations ?? [],
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

const {
  data: sidebarTeamsData,
  pending: sidebarTeamsPending,
  refresh: refreshSidebarTeams,
} = await useFetch<{
  projects: Array<{
    project: string;
    teams: Array<{ id: string; name: string }>;
  }>;
}>(sidebarTeamsUrl, {
  immediate: false,
  watch: false,
});
const sidebarTeamGroups = computed(
  () => sidebarTeamsData.value?.projects ?? [],
);

watch(
  canLoadAzure,
  async (ready) => {
    if (!ready) return;
    await Promise.all([
      refreshOrganizations(),
      refreshProjects(),
      refreshSidebarTeams(),
    ]);
  },
  { immediate: true },
);

const isAddOrganizationOpen = ref(false);
const newOrganization = ref("");
const addingOrganization = ref(false);
const settingDefaultOrganization = ref(false);

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

function getSectionRoute(
  section: SectionView,
  selection: { project?: string; team?: string; sprint?: string; resetSprint?: boolean } = {},
) {
  if (section === "settings") {
    return "/settings";
  }

  return buildProjectSectionRoute(
    route.query,
    activeOrganization.value,
    selection.project ?? selectedProject.value ?? "",
    section,
    {
      team: selection.team ?? selectedTeam.value,
      sprint: selection.sprint ?? selectedSprintPath.value,
      resetSprint: selection.resetSprint,
    },
  );
}

const viewNavigation = computed<NavigationMenuItem[][]>(() => {
  const teamsGroup: NavigationMenuItem[] = [
    { label: "Sprint teams", type: "label" },
  ];

  for (const group of sidebarTeamGroups.value) {
    teamsGroup.push({
      label: group.project,
      type: "label",
    });

    for (const team of group.teams) {
      teamsGroup.push({
        label: team.name,
        icon:
          (
            selectedProject.value === group.project &&
            selectedTeam.value === team.name
          ) ?
            "i-lucide-users-round"
          : "i-lucide-users",
        active:
          activeSection.value === "sprint-task" &&
          selectedProject.value === group.project &&
          selectedTeam.value === team.name,
        to: getSectionRoute("sprint-task", {
          project: group.project,
          team: team.name,
          resetSprint: group.project !== selectedProject.value || team.name !== selectedTeam.value,
        }),
      });
    }
  }

  return [
    [
      {
        label: "Tasks",
        icon: "i-lucide-list-filter",
        active: activeSection.value === "tasks",
        to: getSectionRoute("tasks"),
      },
      {
        label: "Overview",
        icon: "i-lucide-chart-no-axes-column",
        active: activeSection.value === "report",
        to: getSectionRoute("report"),
      },
      {
        label: "Sprints",
        icon: "i-lucide-flag",
        active: activeSection.value === "sprint-task",
        children: sidebarTeamGroups.value.flatMap((group) =>
          group.teams.map((team) => ({
            label: team.name,

            active:
              activeSection.value === "sprint-task" &&
              selectedProject.value === group.project &&
              selectedTeam.value === team.name,
            to: getSectionRoute("sprint-task", {
              project: group.project,
              team: team.name,
            }),
          })),
        ),
      },
      {
        label: "Settings",
        icon: "i-lucide-settings-2",
        active: activeSection.value === "settings",
        to: getSectionRoute("settings"),
      },
    ],
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
