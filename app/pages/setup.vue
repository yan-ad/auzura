<script setup lang="ts">
import type { AzureOrganization } from "~/types/azure-devops";

definePageMeta({ layout: false });

const toast = useToast();
const router = useRouter();
const selectedOrganization = useCookie<string>("auzura:organization", {
  default: () => "",
});
const selectedProject = useCookie<string>("auzura:selected-project", {
  default: () => "",
});
const form = reactive({
  organization: selectedOrganization.value || "",
});
const busy = ref(false);
const { loggedIn } = useUserSession();

function getWorkspaceTargetPath(
  organizationSlug: string,
  projectName?: string,
) {
  const organization = organizationSlug.trim();
  const project = String(projectName || "").trim();

  if (!organization) return "/setup";
  if (!project) return `/${encodeURIComponent(organization)}`;

  return `/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/tasks`;
}

async function redirectIfWorkspaceReady() {
  const organizationSlug = selectedOrganization.value.trim();
  const projectName = selectedProject.value.trim();
  if (!organizationSlug || !projectName) return;

  const target = getWorkspaceTargetPath(organizationSlug, projectName);
  if (router.currentRoute.value.path !== target) {
    await router.replace(target);
  }
}

const {
  data: organizationsData,
  pending: organizationsPending,
  refresh: refreshOrganizations,
} = await useAsyncData("azure-organizations", () =>
  $fetch<{ organizations: AzureOrganization[] }>("/api/azure/organizations"),
);

const organizationOptions = computed(() =>
  (organizationsData.value?.organizations ?? []).map((item) => item.slug),
);
const hasOrganizationOptions = computed(
  () => organizationOptions.value.length > 0,
);
const defaultOrganization = computed(() =>
  (organizationsData.value?.organizations ?? []).find((item) => item.isDefault),
);

watch(
  [organizationOptions, defaultOrganization],
  ([options, defaultOrg]) => {
    if (!options.length) return;

    const current = form.organization.trim();
    if (current && options.includes(current)) return;

    const fallback = defaultOrg?.slug || options[0] || "";
    if (!fallback) return;

    form.organization = fallback;
    selectedOrganization.value = fallback;
  },
  { immediate: true },
);

watch(
  loggedIn,
  async (value) => {
    if (!value) return;
    await refreshOrganizations();
  },
  { immediate: true },
);

onMounted(async () => {
  await redirectIfWorkspaceReady();
});

async function submitSetup() {
  const organization = form.organization.trim();

  if (!organization) {
    toast.add({ title: "Organization is required", color: "warning" });
    return;
  }

  if (!loggedIn.value) {
    toast.add({ title: "Sign in with Microsoft first", color: "warning" });
    return;
  }

  busy.value = true;

  try {
    const response = await $fetch<{
      organization: string;
      projects: Array<{ name: string }>;
    }>("/api/azure/setup", {
      method: "POST",
      body: { organization },
    });

    selectedOrganization.value = response.organization;
    selectedProject.value = response.projects[0]?.name || "";

    const target = getWorkspaceTargetPath(
      selectedOrganization.value,
      selectedProject.value,
    );

    await router.replace(target);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Setup failed";
    toast.add({ title: "Setup failed", description: message, color: "error" });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div
    class="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-10"
  >
    <UCard class="w-full" variant="subtle">
      <template #header>
        <div class="space-y-1">
          <h1 class="text-xl font-semibold text-highlighted">
            Workspace setup
          </h1>
          <p class="text-sm text-muted">
            Pick your Azure DevOps organization to continue.
          </p>
        </div>
      </template>

      <UForm :state="form" class="space-y-4" @submit="submitSetup">
        <UFormField
          name="organization"
          label="Organization"
          required
          :help="
            hasOrganizationOptions ?
              'Fetched from your Azure DevOps account.'
            : 'No organizations loaded yet. You can still enter the slug manually.'
          "
        >
          <div class="flex gap-1 items-start">
            <USelectMenu
              v-if="hasOrganizationOptions"
              v-model="form.organization"
              :items="organizationOptions"
              :loading="organizationsPending"
              icon="i-lucide-building-2"
              class="flex-1"
              placeholder="Select organization"
              searchable
              size="lg"
            />
            <UInput
              v-else
              v-model="form.organization"
              :loading="organizationsPending"
              icon="i-lucide-building-2"
              class="flex-1"
              placeholder="your-azure-org"
              size="lg"
            />
          </div>
        </UFormField>

        <div
          v-if="defaultOrganization"
          class="rounded-lg border border-default bg-elevated/40 px-3 py-2 text-sm text-muted"
        >
          Default organization:
          <span class="font-medium text-highlighted">
            {{ defaultOrganization.name || defaultOrganization.slug }}
          </span>
        </div>

        <UButton color="primary" block :loading="busy" type="submit">
          Save and continue
        </UButton>
      </UForm>
    </UCard>
  </div>
</template>
