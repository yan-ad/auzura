<script setup lang="ts">
import type { AzureOrganization } from '~/types/azure-devops'

definePageMeta({ layout: false })

const toast = useToast()
const router = useRouter()
const selectedOrganization = useCookie<string>('auzura:organization', { default: () => '' })
const selectedProject = useCookie<string>('auzura:selected-project', { default: () => '' })
const organization = ref(selectedOrganization.value || '')
const busy = ref(false)
const { loggedIn } = useUserSession()

const {
  data: organizationsData,
  pending: organizationsPending,
  refresh: refreshOrganizations,
} = await useFetch<{ organizations: AzureOrganization[] }>('/api/azure/organizations', {
  immediate: false,
  watch: false,
  default: () => ({ organizations: [] }),
})

const organizationOptions = computed(() =>
  (organizationsData.value?.organizations ?? []).map((item) => item.slug),
)
const hasOrganizationOptions = computed(() => organizationOptions.value.length > 0)

async function refreshOrganizationOptions() {
  await refreshOrganizations()
}

watch(
  loggedIn,
  async (value) => {
    if (!value) return
    await refreshOrganizations()
  },
  { immediate: true },
)

watch(
  [selectedOrganization, selectedProject],
  async ([organizationValue, projectValue]) => {
    const organizationSlug = organizationValue.trim()
    const projectName = projectValue.trim()
    if (!organizationSlug || !projectName) return

    const target = `/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(projectName)}/tasks`
    if (router.currentRoute.value.path !== target) {
      await router.replace(target)
    }
  },
  { immediate: true }
)

async function submitSetup() {
  if (!organization.value.trim()) {
    toast.add({ title: 'Organization is required', color: 'warning' })
    return
  }

  if (!loggedIn.value) {
    toast.add({ title: 'Sign in with Microsoft first', color: 'warning' })
    return
  }

  busy.value = true

  try {
    const response = await $fetch<{ organization: string, projects: Array<{ name: string }> }>('/api/azure/setup', {
      method: 'POST',
      body: { organization: organization.value.trim() }
    })

    selectedOrganization.value = response.organization
    selectedProject.value = response.projects[0]?.name || ''

    const target = selectedProject.value
      ? `/${encodeURIComponent(selectedOrganization.value)}/${encodeURIComponent(selectedProject.value)}/tasks`
      : `/${encodeURIComponent(selectedOrganization.value)}`

    await router.replace(target)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Setup failed'
    toast.add({ title: 'Setup failed', description: message, color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-10">
    <UCard class="w-full" variant="subtle">
      <template #header>
        <div class="space-y-1">
          <h1 class="text-xl font-semibold text-highlighted">Workspace setup</h1>
          <p class="text-sm text-muted">Pick your Azure DevOps organization to continue.</p>
        </div>
      </template>

      <div class="space-y-4">
        <UFormField
          label="Organization"
          required
          :help="hasOrganizationOptions ? 'Fetched from your Azure DevOps account.' : 'No organizations loaded yet. You can still enter the slug manually.'"
        >
          <USelectMenu
            v-if="hasOrganizationOptions"
            v-model="organization"
            :items="organizationOptions"
            :loading="organizationsPending"
            icon="i-lucide-building-2"
            placeholder="Select organization"
            searchable
          />
          <UInput
            v-else
            v-model="organization"
            :loading="organizationsPending"
            icon="i-lucide-building-2"
            placeholder="your-azure-org"
          />
        </UFormField>

        <UButton
          v-if="loggedIn"
          color="neutral"
          variant="ghost"
          block
          :loading="organizationsPending"
          @click="refreshOrganizationOptions"
        >
          Refresh organizations
        </UButton>

        <UButton color="primary" block :loading="busy" @click="submitSetup">
          Save and continue
        </UButton>
      </div>
    </UCard>
  </div>
</template>
