<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { AzureProject, AzureWorkItem } from '~/types/azure-devops'

const toast = useToast()
const states = ['New', 'Active', 'Resolved', 'Closed']
const workItemTypes = ['User Story', 'Task', 'Bug']
const selectedOrganization = useCookie<string>('auzura:organization', { default: () => '' })
const selectedProject = useCookie<string>('auzura:selected-project', { default: () => '' })
const selectedView = ref<'assigned' | 'board'>('assigned')
const selectedItemId = ref<number | null>(null)
const isDetailOpen = ref(false)
const { loggedIn, user, fetch: refreshSession } = useUserSession()

const form = reactive({
  title: '',
  type: 'Task',
  description: '',
  assignedTo: '',
  tags: 'auzura'
})

const activeOrganization = computed(() => selectedOrganization.value.trim())
const organizationQuery = computed(() => activeOrganization.value ? `organization=${encodeURIComponent(activeOrganization.value)}` : '')

const projectsUrl = computed(() => `/api/azure/projects${organizationQuery.value ? `?${organizationQuery.value}` : ''}`)
const { data: projectsData, pending: projectsPending, error: projectsError, refresh: refreshProjects } = await useFetch<{ projects: AzureProject[] }>(projectsUrl, {
  immediate: false,
  watch: false
})

const projects = computed(() => projectsData.value?.projects ?? [])
const projectOptions = computed(() => projects.value.map((project) => project.name))
const activeProject = computed(() => selectedProject.value || projectOptions.value[0] || '')
const canLoadAzure = computed(() => loggedIn.value)

watch([activeOrganization, canLoadAzure], async ([, isLoggedIn]) => {
  selectedProject.value = ''

  if (!isLoggedIn) {
    projectsData.value = undefined
    projectsError.value = undefined
    return
  }

  await refreshProjects()
}, { immediate: true })

watch(projectOptions, (options) => {
  if (!canLoadAzure.value) return

  if (!selectedProject.value && options[0]) {
    selectedProject.value = options[0]
  }

  if (selectedProject.value && options[0] && !options.includes(selectedProject.value)) {
    selectedProject.value = options[0]
  }
}, { immediate: true })

function withOrganizationQuery(path: string) {
  return `${path}${organizationQuery.value ? `&${organizationQuery.value}` : ''}`
}

const boardUrl = computed(() => withOrganizationQuery(`/api/azure/work-items?project=${encodeURIComponent(activeProject.value)}`))
const assignedUrl = computed(() => withOrganizationQuery(`/api/azure/work-items/assigned?project=${encodeURIComponent(activeProject.value)}`))
const detailUrl = computed(() => selectedItemId.value && activeProject.value
  ? withOrganizationQuery(`/api/azure/work-items/${selectedItemId.value}?project=${encodeURIComponent(activeProject.value)}`)
  : null)

const { data: boardData, pending: boardPending, error: boardError, refresh: refreshBoard } = await useFetch<{ items: AzureWorkItem[] }>(boardUrl, {
  immediate: false,
  watch: false
})

const { data: assignedData, pending: assignedPending, error: assignedError, refresh: refreshAssigned } = await useFetch<{ items: AzureWorkItem[] }>(assignedUrl, {
  immediate: false,
  watch: false
})

const { data: detailData, pending: detailPending, refresh: refreshDetail } = await useFetch<{ item: AzureWorkItem }>(() => detailUrl.value || '/api/azure/work-items/0', {
  immediate: false,
  watch: false
})

watch([activeProject, canLoadAzure], async ([project, isLoggedIn]) => {
  if (project && isLoggedIn) {
    await Promise.all([refreshBoard(), refreshAssigned()])
  }
}, { immediate: true })

const assignedItems = computed(() => assignedData.value?.items ?? [])
const boardItems = computed(() => boardData.value?.items ?? [])
const selectedItem = computed(() => detailData.value?.item || assignedItems.value.find((item) => item.id === selectedItemId.value) || boardItems.value.find((item) => item.id === selectedItemId.value))
const busy = computed(() => boardPending.value || assignedPending.value || projectsPending.value)

const columns = computed(() => states.map((state) => ({
  state,
  items: boardItems.value.filter((item) => item.state === state)
})))

const assignedByState = computed(() => states.map((state) => ({
  label: state,
  count: assignedItems.value.filter((item) => item.state === state).length
})))

const dashboardStats = computed<Array<{
  title: string
  icon: string
  value: string | number
  tone: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
}>>(() => [{
  title: 'Assigned to me',
  icon: 'i-lucide-list-checks',
  value: assignedItems.value.length,
  tone: 'primary'
}, {
  title: 'Recent board items',
  icon: 'i-lucide-kanban',
  value: boardItems.value.length,
  tone: 'info'
}, {
  title: 'Active project',
  icon: 'i-lucide-folder-kanban',
  value: activeProject.value || '—',
  tone: 'success'
}, {
  title: 'Azure organization',
  icon: 'i-lucide-building-2',
  value: activeOrganization.value || 'Env default',
  tone: 'neutral'
}])

const viewNavigation = computed<NavigationMenuItem[][]>(() => [[{
  label: 'Assigned to me',
  icon: 'i-lucide-list-checks',
  badge: String(assignedItems.value.length),
  active: selectedView.value === 'assigned',
  onSelect: () => { selectedView.value = 'assigned' }
}, {
  label: 'Kanban board',
  icon: 'i-lucide-kanban',
  badge: String(boardItems.value.length),
  active: selectedView.value === 'board',
  onSelect: () => { selectedView.value = 'board' }
}]])


function formatDate(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function stripHtml(value?: string) {
  if (!value) return 'No description.'
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || 'No description.'
}

function stateColor(state?: string) {
  if (state === 'Closed') return 'success'
  if (state === 'Resolved') return 'info'
  if (state === 'Active') return 'warning'
  return 'neutral'
}

async function refreshCurrentView() {
  if (!canLoadAzure.value || !activeProject.value) return
  await Promise.all([refreshBoard(), refreshAssigned()])
  if (selectedItemId.value) {
    await refreshDetail()
  }
}

async function createItem() {
  if (!activeProject.value) {
    toast.add({ title: 'Pick a project first', color: 'warning' })
    return
  }

  if (!form.title.trim()) {
    toast.add({ title: 'Title required', color: 'warning' })
    return
  }

  await $fetch(withOrganizationQuery(`/api/azure/work-items?project=${encodeURIComponent(activeProject.value)}`), {
    method: 'POST',
    body: {
      title: form.title,
      type: form.type,
      description: form.description || undefined,
      assignedTo: form.assignedTo || undefined,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    }
  })

  toast.add({ title: 'Work item created', description: activeProject.value, color: 'success' })
  form.title = ''
  form.description = ''
  await refreshCurrentView()
}

async function moveItem(item: AzureWorkItem, state: string) {
  if (!activeProject.value || item.state === state) return

  await $fetch(withOrganizationQuery(`/api/azure/work-items/${item.id}/state?project=${encodeURIComponent(activeProject.value)}`), {
    method: 'PATCH',
    body: { state }
  })

  toast.add({ title: `Moved #${item.id} to ${state}`, description: activeProject.value, color: 'success' })
  await refreshCurrentView()
}

async function loginWithMicrosoft() {
  await navigateTo('/api/auth/azure/login', { external: true })
}

async function logoutFromMicrosoft() {
  await $fetch('/api/auth/azure/logout', { method: 'POST' })
  projectsData.value = undefined
  projectsError.value = undefined
  boardData.value = undefined
  boardError.value = undefined
  assignedData.value = undefined
  assignedError.value = undefined
  detailData.value = undefined
  selectedProject.value = ''
  selectedItemId.value = null
  isDetailOpen.value = false
  await refreshSession()
  toast.add({ title: 'Signed out', color: 'success' })
}

async function openDetail(item: AzureWorkItem) {
  selectedItemId.value = item.id
  isDetailOpen.value = true
  await refreshDetail()
}
</script>

<template>
  <UDashboardGroup storage="local" storage-key="auzura-dashboard" unit="rem">
    <UDashboardSidebar
      id="auzura-sidebar"
      collapsible
      resizable
      class="bg-elevated/40"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <div class="flex min-w-0 items-center gap-3 px-1 py-2">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring ring-primary/25">
            <UIcon name="i-lucide-cloud-cog" class="size-5 text-primary" />
          </div>
          <div v-if="!collapsed" class="min-w-0">
            <p class="truncate text-sm font-semibold text-highlighted">Auzura</p>
            <p class="truncate text-xs text-muted">Azure Boards cockpit</p>
          </div>
        </div>
      </template>

      <template #default="{ collapsed }">
        <div v-if="!collapsed" class="rounded-lg border border-default bg-default/60 px-3 py-2 text-xs text-muted">
          Switch views and projects from this cockpit.
        </div>

        <UNavigationMenu
          :collapsed="collapsed"
          :items="viewNavigation[0]"
          orientation="vertical"
          tooltip
          class="mt-3"
        />

        <div v-if="!collapsed" class="mt-6 space-y-4 rounded-xl border border-default bg-default/60 p-3">
          <div class="space-y-1">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">Microsoft auth</p>
            <p class="truncate text-sm font-medium text-highlighted">
              {{ loggedIn ? (user?.displayName || user?.email || 'Signed in') : 'Sign in required' }}
            </p>
            <p class="text-xs text-muted">OAuth callback: auzura.vercel.app</p>
          </div>

          <div class="grid gap-2">
            <UButton icon="i-lucide-log-in" color="primary" variant="soft" block @click="loginWithMicrosoft">
              {{ loggedIn ? 'Switch account' : 'Sign in' }}
            </UButton>
            <UButton icon="i-lucide-log-out" color="neutral" variant="ghost" block :disabled="!loggedIn" @click="logoutFromMicrosoft">
              Sign out
            </UButton>
          </div>
        </div>

        <div v-if="!collapsed" class="mt-4 space-y-4 rounded-xl border border-default bg-default/60 p-3">
          <UFormField label="Organization" help="Empty uses env default.">
            <UInput v-model="selectedOrganization" icon="i-lucide-building-2" placeholder="your-azure-org" />
          </UFormField>

          <UFormField label="Project">
            <USelectMenu
              v-model="selectedProject"
              :items="projectOptions"
              :loading="projectsPending"
              icon="i-lucide-folder-kanban"
              placeholder="Select project"
              searchable
            />
          </UFormField>
        </div>

        <div v-if="!collapsed" class="mt-auto grid grid-cols-2 gap-2">
          <div v-for="item in assignedByState" :key="item.label" class="rounded-lg border border-default bg-elevated/60 p-3">
            <p class="text-xs text-muted">{{ item.label }}</p>
            <p class="text-xl font-semibold text-highlighted">{{ item.count }}</p>
          </div>
        </div>
      </template>

      <template #footer="{ collapsed }">
        <UButton
          :icon="collapsed ? 'i-lucide-refresh-cw' : undefined"
          :label="collapsed ? undefined : 'Refresh content'"
          color="neutral"
          variant="ghost"
          block
          :loading="busy"
          :disabled="!canLoadAzure || !activeProject"
          @click="refreshCurrentView()"
        />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel id="auzura-main">
      <template #header>
        <UDashboardNavbar :title="activeProject || 'Azure Boards'" :ui="{ right: 'gap-2' }">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #right>
            <UBadge :color="loggedIn ? 'success' : 'warning'" variant="soft">
              {{ loggedIn ? 'Microsoft connected' : 'Login required' }}
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
                icon="i-lucide-list-checks"
                :color="selectedView === 'assigned' ? 'primary' : 'neutral'"
                :variant="selectedView === 'assigned' ? 'subtle' : 'ghost'"
                @click="selectedView = 'assigned'"
              >
                Assigned
              </UButton>
              <UButton
                icon="i-lucide-kanban"
                :color="selectedView === 'board' ? 'primary' : 'neutral'"
                :variant="selectedView === 'board' ? 'subtle' : 'ghost'"
                @click="selectedView = 'board'"
              >
                Kanban
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
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <div class="space-y-6">
          <section class="space-y-3">
            <UBadge color="primary" variant="soft">
              {{ selectedView === 'assigned' ? 'Personal watchlist' : 'Kanban view' }}
            </UBadge>
            <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 class="text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
                  {{ activeProject || 'Pick a project' }}
                </h1>
                <p class="mt-2 max-w-2xl text-sm text-muted">
                  Dashboard buat pantau Azure Boards: assigned items, recent board, create work item, dan update status tanpa keluar app.
                </p>
              </div>
              <UButton icon="i-lucide-plus" :disabled="!activeProject" @click="selectedView = 'board'">
                New work item
              </UButton>
            </div>
          </section>

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
            v-if="assignedError || boardError"
            color="error"
            variant="soft"
            icon="i-lucide-triangle-alert"
            title="Azure DevOps request failed"
            :description="assignedError?.message || boardError?.message"
          />

          <UPageGrid class="gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-px">
            <UPageCard
              v-for="(stat, index) in dashboardStats"
              :key="stat.title"
              :icon="stat.icon"
              :title="stat.title"
              variant="subtle"
              :ui="{
                container: 'gap-y-1.5',
                wrapper: 'items-start',
                leading: 'p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25',
                title: 'font-normal text-muted text-xs uppercase'
              }"
              class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
            >
              <div class="flex items-center gap-2">
                <span class="truncate text-2xl font-semibold text-highlighted">
                  {{ stat.value }}
                </span>
                <UBadge :color="stat.tone" variant="subtle" class="text-xs">
                  live
                </UBadge>
              </div>
            </UPageCard>
          </UPageGrid>

          <UCard v-if="selectedView === 'assigned'" variant="subtle">
            <template #header>
              <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">Assigned to me</h2>
                  <p class="text-sm text-muted">{{ assignedItems.length }} item in {{ activeProject || 'selected project' }}</p>
                </div>
                <UButton icon="i-lucide-refresh-cw" :loading="assignedPending" color="neutral" variant="subtle" @click="refreshAssigned()">
                  Refresh list
                </UButton>
              </div>
            </template>

            <div class="overflow-x-auto">
              <table class="w-full min-w-[880px] text-left text-sm">
                <thead class="border-b border-default text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th class="px-3 py-3">Key</th>
                    <th class="px-3 py-3">Title</th>
                    <th class="px-3 py-3">Type</th>
                    <th class="px-3 py-3">Priority</th>
                    <th class="px-3 py-3">Updated</th>
                    <th class="px-3 py-3">Status</th>
                    <th class="px-3 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr v-if="assignedPending" v-for="index in 5" :key="index">
                    <td colspan="7" class="px-3 py-4"><USkeleton class="h-8" /></td>
                  </tr>
                  <tr v-for="item in assignedItems" v-else :key="item.id" class="hover:bg-elevated/50">
                    <td class="whitespace-nowrap px-3 py-4 text-muted">#{{ item.id }}</td>
                    <td class="px-3 py-4">
                      <button class="max-w-md truncate text-left font-medium text-highlighted hover:text-primary" @click="openDetail(item)">
                        {{ item.title }}
                      </button>
                      <p class="mt-1 truncate text-xs text-muted">{{ item.areaPath || 'No area' }}</p>
                    </td>
                    <td class="whitespace-nowrap px-3 py-4"><UBadge color="neutral" variant="soft">{{ item.type }}</UBadge></td>
                    <td class="whitespace-nowrap px-3 py-4 text-toned">{{ item.priority || '—' }}</td>
                    <td class="whitespace-nowrap px-3 py-4 text-muted">{{ formatDate(item.changedDate) }}</td>
                    <td class="min-w-40 px-3 py-4">
                      <USelectMenu :model-value="item.state" :items="states" size="xs" @update:model-value="moveItem(item, String($event))" />
                    </td>
                    <td class="whitespace-nowrap px-3 py-4 text-right">
                      <UButton icon="i-lucide-panel-right-open" color="neutral" variant="ghost" size="xs" @click="openDetail(item)">
                        Detail
                      </UButton>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p v-if="!assignedPending && activeProject && !assignedItems.length" class="rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted">
              No assigned work items in this project.
            </p>
          </UCard>

          <template v-else>
            <UCard variant="subtle">
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">Quick create</h2>
                  <p class="text-sm text-muted">Creates inside <span class="font-medium text-highlighted">{{ activeProject || 'selected project' }}</span> using your Microsoft OAuth session.</p>
                </div>
              </template>

              <form class="grid gap-4 lg:grid-cols-12" @submit.prevent="createItem">
                <UFormField label="Title" class="lg:col-span-4">
                  <UInput v-model="form.title" icon="i-lucide-pencil" placeholder="Fix flaky release checklist" :disabled="!activeProject" />
                </UFormField>

                <UFormField label="Type" class="lg:col-span-2">
                  <USelect v-model="form.type" :items="workItemTypes" :disabled="!activeProject" />
                </UFormField>

                <UFormField label="Assigned to" class="lg:col-span-3">
                  <UInput v-model="form.assignedTo" icon="i-lucide-user" placeholder="name@company.com" :disabled="!activeProject" />
                </UFormField>

                <UFormField label="Tags" class="lg:col-span-3">
                  <UInput v-model="form.tags" icon="i-lucide-tags" placeholder="auzura, dx" :disabled="!activeProject" />
                </UFormField>

                <UFormField label="Description" class="lg:col-span-10">
                  <UTextarea v-model="form.description" autoresize placeholder="What should happen?" :disabled="!activeProject" />
                </UFormField>

                <div class="flex items-end lg:col-span-2">
                  <UButton type="submit" block icon="i-lucide-plus" :disabled="!activeProject">Create</UButton>
                </div>
              </form>
            </UCard>

            <section class="grid gap-4 xl:grid-cols-4">
              <UCard
                v-for="column in columns"
                :key="column.state"
                variant="subtle"
                class="min-h-96"
              >
                <template #header>
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <UBadge :color="stateColor(column.state)" variant="soft">{{ column.state }}</UBadge>
                    </div>
                    <UBadge color="neutral" variant="soft">{{ column.items.length }}</UBadge>
                  </div>
                </template>

                <div class="space-y-3">
                  <USkeleton v-if="boardPending" v-for="index in 3" :key="index" class="h-28" />

                  <UPageCard v-for="item in column.items" v-else :key="item.id" variant="subtle" class="hover:ring-primary/30">
                    <div class="space-y-3">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <p class="text-xs text-muted">#{{ item.id }} · {{ item.type }}</p>
                          <button class="line-clamp-2 text-left font-medium text-highlighted hover:text-primary" @click="openDetail(item)">
                            {{ item.title }}
                          </button>
                        </div>
                        <UBadge v-if="item.tags[0]" color="primary" variant="soft">{{ item.tags[0] }}</UBadge>
                      </div>

                      <p v-if="item.assignedTo" class="truncate text-xs text-muted">Assigned: {{ item.assignedTo }}</p>

                      <USelectMenu :model-value="item.state" :items="states" size="xs" @update:model-value="moveItem(item, String($event))" />
                    </div>
                  </UPageCard>

                  <p v-if="!boardPending && activeProject && !column.items.length" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
                    No recent items.
                  </p>
                </div>
              </UCard>
            </section>
          </template>
        </div>
      </template>
    </UDashboardPanel>

    <UModal v-model:open="isDetailOpen" :title="selectedItem ? `#${selectedItem.id} ${selectedItem.title}` : 'Work item detail'" :description="activeProject">
      <template #body>
        <div v-if="detailPending" class="space-y-4">
          <USkeleton class="h-8" />
          <USkeleton class="h-40" />
        </div>

        <div v-else-if="selectedItem" class="space-y-5">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge color="neutral" variant="soft">{{ selectedItem.type }}</UBadge>
            <UBadge :color="stateColor(selectedItem.state)" variant="soft">{{ selectedItem.state }}</UBadge>
            <UBadge v-if="selectedItem.priority" color="warning" variant="soft">P{{ selectedItem.priority }}</UBadge>
            <UBadge v-for="tag in selectedItem.tags" :key="tag" color="neutral" variant="outline">{{ tag }}</UBadge>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">Assigned to</p>
              <p class="text-sm text-highlighted">{{ selectedItem.assignedTo || 'Unassigned' }}</p>
            </div>
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">Changed</p>
              <p class="text-sm text-highlighted">{{ formatDate(selectedItem.changedDate) }}</p>
            </div>
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">Area</p>
              <p class="text-sm text-highlighted">{{ selectedItem.areaPath || '—' }}</p>
            </div>
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">Iteration</p>
              <p class="text-sm text-highlighted">{{ selectedItem.iterationPath || '—' }}</p>
            </div>
          </div>

          <UFormField label="Status">
            <USelectMenu :model-value="selectedItem.state" :items="states" @update:model-value="moveItem(selectedItem, String($event))" />
          </UFormField>

          <div class="space-y-2">
            <h3 class="font-semibold text-highlighted">Description</h3>
            <p class="whitespace-pre-wrap rounded-lg border border-default bg-elevated/40 p-4 text-sm leading-6 text-toned">
              {{ stripHtml(selectedItem.description) }}
            </p>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-between gap-3">
          <UButton v-if="selectedItem?.webUrl" :to="selectedItem.webUrl" target="_blank" icon="i-lucide-external-link" color="neutral" variant="subtle">
            Open in Azure
          </UButton>
          <UButton color="neutral" variant="ghost" @click="isDetailOpen = false">Close</UButton>
        </div>
      </template>
    </UModal>
  </UDashboardGroup>
</template>
