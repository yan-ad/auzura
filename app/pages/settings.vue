<script setup lang="ts">
const toast = useToast();

const organizationCookie = useCookie<string>("auzura:organization", {
  default: () => "",
});
const projectCookie = useCookie<string>("auzura:selected-project", {
  default: () => "",
});

const organization = computed({
  get: () => String(organizationCookie.value || "").trim(),
  set: (value: string) => {
    organizationCookie.value = value;
  },
});
const project = computed({
  get: () => String(projectCookie.value || "").trim(),
  set: (value: string) => {
    projectCookie.value = value;
  },
});

const organizationsUrl = "/api/azure/organizations";
const projectsUrl = computed(() => {
  if (!organization.value) return "";
  return `/api/azure/projects?organization=${encodeURIComponent(organization.value)}`;
});

const {
  data: organizationsData,
  pending: organizationsPending,
  refresh: refreshOrganizations,
} = await useFetch<{
  organizations: Array<{ slug: string; isDefault?: boolean }>;
}>(organizationsUrl, {
  immediate: true,
  watch: false,
});
const organizationOptions = computed(() =>
  (organizationsData.value?.organizations ?? []).map((item) => item.slug),
);

const {
  data: projectsData,
  pending: projectsPending,
  refresh: refreshProjects,
} = await useFetch<{ projects: Array<{ name: string }> }>(projectsUrl, {
  immediate: false,
  watch: false,
});
const projectOptions = computed(() =>
  (projectsData.value?.projects ?? []).map((item) => item.name),
);

watch(
  organization,
  async (value) => {
    project.value = "";
    if (!value) {
      projectsData.value = undefined;
      return;
    }
    await refreshProjects();
  },
  { immediate: true },
);

watch(
  organizationOptions,
  (options) => {
    if (!organization.value && options[0]) {
      organization.value = options[0];
    }
  },
  { immediate: true },
);

watch(
  projectOptions,
  (options) => {
    if (!options.length) return;
    if (!project.value || !options.includes(project.value)) {
      project.value = options[0] || "";
    }
  },
  { immediate: true },
);

const {
  data: aboutData,
  refresh: refreshAbout,
  pending: aboutPending,
} = await useFetch<{
  azureDevOps: {
    configuredOrganization?: string;
    currentOrganization?: string;
    currentProject?: string;
  };
  build: {
    version: string;
    commit: string;
    shortCommit: string;
  };
  session: {
    displayName?: string;
    email?: string;
    lastLoginAt?: string;
    tokenExpiresAt?: string;
    organizationCount: number;
  };
}>("/api/settings/about", {
  query: computed(() => ({
    organization: organization.value,
    project: project.value,
  })),
});

const resyncPending = ref(false);
const purgePending = ref(false);
const defaultPending = ref(false);
const resyncResult = ref<null | {
  syncedAt: string;
  teamCount: number;
  sprintCount: number;
  teams: Array<{ team: string; sprintCount: number }>;
}>(null);
const purgeResult = ref<null | {
  scope: string;
  deletedProjects: number;
  deletedWorkItems: number;
  deletedSprintTeams: number;
  deletedSprints: number;
  deletedUsers: number;
}>(null);

function formatDateTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function setAsDefaultOrganization() {
  if (!organization.value) return;
  defaultPending.value = true;

  try {
    await $fetch("/api/azure/default-organization" as string, {
      method: "POST",
      body: {
        organization: organization.value,
      },
    });
    await Promise.all([refreshAbout(), refreshOrganizations()]);
    await refreshNuxtData();
    toast.add({
      title: "Default organization updated",
      description: `${organization.value} is now your default workspace.`,
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Could not update default organization",
      description:
        error instanceof Error ?
          error.message
        : "Default organization update failed.",
      color: "error",
    });
  } finally {
    defaultPending.value = false;
  }
}

async function resyncSprints() {
  if (!organization.value || !project.value) return;
  resyncPending.value = true;

  try {
    const response = await $fetch<typeof resyncResult.value>(
      "/api/settings/resync-sprints",
      {
        method: "POST",
        body: {
          organization: organization.value,
          project: project.value,
        },
      },
    );

    resyncResult.value = response;
    await refreshNuxtData();
    toast.add({
      title: "Sprint cache re-synced",
      description: `${response?.teamCount || 0} teams and ${response?.sprintCount || 0} sprint iterations refreshed from Azure DevOps.`,
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Re-sync failed",
      description:
        error instanceof Error ?
          error.message
        : "Could not refresh sprint data.",
      color: "error",
    });
  } finally {
    resyncPending.value = false;
  }
}

async function purgeCache(scope: "workspace" | "all") {
  purgePending.value = true;

  try {
    const response = await $fetch<typeof purgeResult.value>(
      "/api/settings/purge-cache",
      {
        method: "POST",
        body: {
          organization: organization.value,
          project: project.value,
          scope,
        },
      },
    );

    purgeResult.value = response;
    await refreshNuxtData();
    await refreshAbout();
    toast.add({
      title: "Cache purged",
      description: `Removed ${response?.deletedWorkItems || 0} work items, ${response?.deletedSprintTeams || 0} team caches, ${response?.deletedSprints || 0} sprint caches, and ${response?.deletedProjects || 0} project snapshots.`,
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Purge failed",
      description:
        error instanceof Error ? error.message : "Could not purge cache.",
      color: "error",
    });
  } finally {
    purgePending.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-default">
    <div
      class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
    >
      <div class="space-y-2">
        <p class="text-sm uppercase tracking-[0.24em] text-muted">
          Workspace settings
        </p>
        <h1 class="text-2xl font-semibold text-highlighted">Settings</h1>
        <p class="text-sm text-muted">
          Buka dari /settings dan pilih workspace untuk re-sync/purge cache.
        </p>
      </div>

      <UCard>
        <template #header>
          <div class="space-y-1">
            <h2 class="text-base font-semibold text-highlighted">Workspace</h2>
            <p class="text-sm text-muted">
              Pilih organization dan project target.
            </p>
          </div>
        </template>

        <div class="grid gap-3 md:grid-cols-2">
          <USelectMenu
            v-model="organization"
            :items="organizationOptions"
            :loading="organizationsPending"
            placeholder="Organization"
            searchable
            class="w-full"
          />
          <USelectMenu
            v-model="project"
            :items="projectOptions"
            :loading="projectsPending"
            :disabled="!organization"
            placeholder="Project"
            searchable
            class="w-full"
          />
        </div>
      </UCard>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
        <UCard>
          <template #header>
            <div class="space-y-1">
              <h2 class="text-base font-semibold text-highlighted">
                Sprint sync
              </h2>
              <p class="text-sm text-muted">
                Rebuild sprint cache by refreshing team list and sprint
                iterations from Azure DevOps.
              </p>
            </div>
          </template>

          <div class="space-y-4">
            <UButton
              color="primary"
              :loading="resyncPending"
              :disabled="!organization || !project"
              @click="resyncSprints"
            >
              Re-sync sprint cache
            </UButton>

            <div
              v-if="resyncResult"
              class="rounded-lg border border-default bg-elevated/40 p-4 text-sm"
            >
              <p class="font-medium text-highlighted">
                Last sync: {{ formatDateTime(resyncResult.syncedAt) }}
              </p>
              <p class="mt-1 text-muted">
                {{ resyncResult.teamCount }} teams,
                {{ resyncResult.sprintCount }} sprint iterations
              </p>
              <ul class="mt-3 space-y-1 text-muted">
                <li v-for="team in resyncResult.teams" :key="team.team">
                  {{ team.team }}: {{ team.sprintCount }} sprints
                </li>
              </ul>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="space-y-1">
              <h2 class="text-base font-semibold text-highlighted">
                Cache maintenance
              </h2>
              <p class="text-sm text-muted">
                Delete stale Mongo cache for this workspace or your full account
                snapshot.
              </p>
            </div>
          </template>

          <div class="space-y-3">
            <UButton
              color="warning"
              variant="soft"
              :loading="purgePending"
              :disabled="!organization || !project"
              @click="purgeCache('workspace')"
            >
              Purge workspace cache
            </UButton>
            <UButton
              color="error"
              variant="soft"
              :loading="purgePending"
              @click="purgeCache('all')"
            >
              Purge all my cache
            </UButton>

            <div
              v-if="purgeResult"
              class="rounded-lg border border-default bg-elevated/40 p-4 text-sm text-muted"
            >
              <p class="font-medium text-highlighted">
                Last purge scope: {{ purgeResult.scope }}
              </p>
              <p>Projects removed: {{ purgeResult.deletedProjects }}</p>
              <p>Work items removed: {{ purgeResult.deletedWorkItems }}</p>
              <p>
                Sprint team caches removed: {{ purgeResult.deletedSprintTeams }}
              </p>
              <p>Sprint caches removed: {{ purgeResult.deletedSprints }}</p>
              <p>User documents removed: {{ purgeResult.deletedUsers }}</p>
            </div>
          </div>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <div class="space-y-1">
            <h2 class="text-base font-semibold text-highlighted">
              Workspace default
            </h2>
            <p class="text-sm text-muted">
              Use this organization as the default target when you open the app
              from the root path.
            </p>
          </div>
        </template>

        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div
            class="rounded-lg border border-default bg-elevated/40 px-4 py-3 text-sm text-muted"
          >
            Organization:
            <span class="font-medium text-highlighted">{{
              organization || "—"
            }}</span>
          </div>

          <UButton
            color="primary"
            variant="soft"
            :loading="defaultPending"
            :disabled="!organization"
            @click="setAsDefaultOrganization"
          >
            Set this organization as default
          </UButton>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="space-y-1">
            <h2 class="text-base font-semibold text-highlighted">About</h2>
            <p class="text-sm text-muted">
              Current Azure DevOps connection and deployed build details.
            </p>
          </div>
        </template>

        <div v-if="aboutPending" class="text-sm text-muted">
          Loading build metadata...
        </div>
        <div v-else class="grid gap-4 md:grid-cols-3">
          <div class="rounded-lg border border-default bg-elevated/40 p-4">
            <p class="text-xs uppercase tracking-[0.18em] text-muted">
              Azure DevOps
            </p>
            <p class="mt-2 text-sm font-medium text-highlighted">
              {{
                aboutData?.azureDevOps.currentOrganization ||
                organization ||
                "—"
              }}
            </p>
            <p class="text-sm text-muted">
              Project:
              {{ aboutData?.azureDevOps.currentProject || project || "—" }}
            </p>
            <p class="text-sm text-muted">
              Configured org:
              {{ aboutData?.azureDevOps.configuredOrganization || "—" }}
            </p>
          </div>

          <div class="rounded-lg border border-default bg-elevated/40 p-4">
            <p class="text-xs uppercase tracking-[0.18em] text-muted">Build</p>
            <p class="mt-2 text-sm font-medium text-highlighted">
              v{{ aboutData?.build.version || "0.0.0" }}
            </p>
            <p class="text-sm text-muted">
              Commit: {{ aboutData?.build.shortCommit || "unknown" }}
            </p>
            <p class="text-sm text-muted break-all">
              {{ aboutData?.build.commit || "No commit metadata found" }}
            </p>
          </div>

          <div class="rounded-lg border border-default bg-elevated/40 p-4">
            <p class="text-xs uppercase tracking-[0.18em] text-muted">
              Session
            </p>
            <p class="mt-2 text-sm font-medium text-highlighted">
              {{ aboutData?.session.displayName || "Unknown user" }}
            </p>
            <p class="text-sm text-muted">
              {{ aboutData?.session.email || "—" }}
            </p>
            <p class="text-sm text-muted">
              Organizations cached:
              {{ aboutData?.session.organizationCount ?? 0 }}
            </p>
            <p class="text-sm text-muted">
              Last login: {{ formatDateTime(aboutData?.session.lastLoginAt) }}
            </p>
            <p class="text-sm text-muted">
              Token expiry:
              {{ formatDateTime(aboutData?.session.tokenExpiresAt) }}
            </p>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
