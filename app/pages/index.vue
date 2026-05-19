<script setup lang="ts">
import type { AzureProject, AzureWorkItem } from '~/types/azure-devops'

const toast = useToast()
const states = ['New', 'Active', 'Resolved', 'Closed']
const workItemTypes = ['User Story', 'Task', 'Bug']
const selectedProject = useCookie<string>('auzura:selected-project', { default: () => '' })
const selectedView = ref<'assigned' | 'board'>('assigned')
const selectedItemId = ref<number | null>(null)
const isDetailOpen = ref(false)

const form = reactive({
  title: '',
  type: 'Task',
  description: '',
  assignedTo: '',
  tags: 'auzura'
})

const { data: projectsData, pending: projectsPending, error: projectsError } = await useFetch<{ projects: AzureProject[] }>('/api/azure/projects')

const projects = computed(() => projectsData.value?.projects ?? [])
const projectOptions = computed(() => projects.value.map((project) => project.name))
const activeProject = computed(() => selectedProject.value || projectOptions.value[0] || '')

watch(projectOptions, (options) => {
  if (!selectedProject.value && options[0]) {
    selectedProject.value = options[0]
  }

  if (selectedProject.value && options[0] && !options.includes(selectedProject.value)) {
    selectedProject.value = options[0]
  }
}, { immediate: true })

const boardUrl = computed(() => `/api/azure/work-items?project=${encodeURIComponent(activeProject.value)}`)
const assignedUrl = computed(() => `/api/azure/work-items/assigned?project=${encodeURIComponent(activeProject.value)}`)
const detailUrl = computed(() => selectedItemId.value && activeProject.value
  ? `/api/azure/work-items/${selectedItemId.value}?project=${encodeURIComponent(activeProject.value)}`
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

watch(activeProject, async (project) => {
  if (project) {
    await Promise.all([refreshBoard(), refreshAssigned()])
  }
}, { immediate: true })

const assignedItems = computed(() => assignedData.value?.items ?? [])
const boardItems = computed(() => boardData.value?.items ?? [])
const selectedItem = computed(() => detailData.value?.item || assignedItems.value.find((item) => item.id === selectedItemId.value) || boardItems.value.find((item) => item.id === selectedItemId.value))
const busy = computed(() => boardPending.value || assignedPending.value)

const columns = computed(() => states.map((state) => ({
  state,
  items: boardItems.value.filter((item) => item.state === state)
})))

const assignedByState = computed(() => states.map((state) => ({
  label: state,
  count: assignedItems.value.filter((item) => item.state === state).length
})))

function formatDate(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function stripHtml(value?: string) {
  if (!value) return 'No description.'
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || 'No description.'
}

async function refreshCurrentView() {
  if (!activeProject.value) return
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

  await $fetch(`/api/azure/work-items?project=${encodeURIComponent(activeProject.value)}`, {
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

  await $fetch(`/api/azure/work-items/${item.id}/state?project=${encodeURIComponent(activeProject.value)}`, {
    method: 'PATCH',
    body: { state }
  })

  toast.add({ title: `Moved #${item.id} to ${state}`, description: activeProject.value, color: 'success' })
  await refreshCurrentView()
}

async function openDetail(item: AzureWorkItem) {
  selectedItemId.value = item.id
  isDetailOpen.value = true
  await refreshDetail()
}
</script>

<template>
  <main class="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
    <div class="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[20rem_1fr]">
      <aside class="space-y-4">
        <UCard variant="subtle" class="sticky top-6 bg-white/5 ring-white/10">
          <template #header>
            <div class="space-y-1">
              <UBadge color="primary" variant="soft">Auzura</UBadge>
              <h1 class="text-2xl font-bold tracking-tight text-white">Azure Boards</h1>
              <p class="text-sm text-slate-400">Jira-ish control surface, tetap scoped per project.</p>
            </div>
          </template>

          <div class="space-y-5">
            <UAlert
              v-if="projectsError"
              color="error"
              variant="soft"
              title="Project list failed"
              :description="projectsError.message"
            />

            <UFormField label="Project">
              <USelectMenu
                v-model="selectedProject"
                :items="projectOptions"
                :loading="projectsPending"
                placeholder="Select Azure project"
                searchable
              />
            </UFormField>

            <div class="space-y-2">
              <UButton
                icon="i-lucide-list-checks"
                :color="selectedView === 'assigned' ? 'primary' : 'neutral'"
                :variant="selectedView === 'assigned' ? 'solid' : 'subtle'"
                block
                @click="selectedView = 'assigned'"
              >
                Assigned to me
                <template #trailing>
                  <UBadge color="neutral" variant="soft">{{ assignedItems.length }}</UBadge>
                </template>
              </UButton>

              <UButton
                icon="i-lucide-kanban"
                :color="selectedView === 'board' ? 'primary' : 'neutral'"
                :variant="selectedView === 'board' ? 'solid' : 'subtle'"
                block
                @click="selectedView = 'board'"
              >
                Kanban board
              </UButton>
            </div>

            <div class="rounded-lg border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-300">
              <p class="text-xs uppercase tracking-wide text-slate-500">Active project</p>
              <p class="mt-1 font-medium text-white">{{ activeProject || 'No project selected' }}</p>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div v-for="item in assignedByState" :key="item.label" class="rounded-lg border border-white/10 bg-white/5 p-3">
                <p class="text-xs text-slate-400">{{ item.label }}</p>
                <p class="text-xl font-semibold text-white">{{ item.count }}</p>
              </div>
            </div>

            <UButton icon="i-lucide-refresh-cw" :loading="busy" color="neutral" variant="subtle" block :disabled="!activeProject" @click="refreshCurrentView()">
              Refresh
            </UButton>
          </div>
        </UCard>
      </aside>

      <div class="flex min-w-0 flex-col gap-8">
        <section class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div class="space-y-3">
            <UBadge color="primary" variant="soft" size="lg">{{ selectedView === 'assigned' ? 'Personal watchlist' : 'Kanban view' }}</UBadge>
            <h2 class="max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-6xl">
              {{ activeProject || 'Pick a project' }}
            </h2>
            <p class="max-w-2xl text-lg text-slate-300">
              Pantau item yang ke-assign ke lu, buka detail modal, dan ubah status langsung dari list.
            </p>
          </div>
        </section>

        <UAlert
          v-if="assignedError || boardError"
          color="error"
          variant="soft"
          title="Azure DevOps request failed"
          :description="assignedError?.message || boardError?.message"
        />

        <UCard v-if="selectedView === 'assigned'" variant="subtle" class="bg-white/5 ring-white/10">
          <template #header>
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 class="text-lg font-semibold text-white">Assigned to me</h2>
                <p class="text-sm text-slate-400">{{ assignedItems.length }} item in {{ activeProject || 'selected project' }}</p>
              </div>
              <UButton icon="i-lucide-refresh-cw" :loading="assignedPending" color="neutral" variant="subtle" @click="refreshAssigned()">
                Refresh list
              </UButton>
            </div>
          </template>

          <div class="overflow-x-auto">
            <table class="w-full min-w-[880px] text-left text-sm">
              <thead class="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
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
              <tbody class="divide-y divide-white/10">
                <tr v-if="assignedPending" v-for="index in 5" :key="index">
                  <td colspan="7" class="px-3 py-4"><USkeleton class="h-8" /></td>
                </tr>
                <tr v-for="item in assignedItems" v-else :key="item.id" class="hover:bg-white/5">
                  <td class="whitespace-nowrap px-3 py-4 text-slate-400">#{{ item.id }}</td>
                  <td class="px-3 py-4">
                    <button class="max-w-md truncate text-left font-medium text-white hover:text-primary-300" @click="openDetail(item)">
                      {{ item.title }}
                    </button>
                    <p class="mt-1 truncate text-xs text-slate-500">{{ item.areaPath || 'No area' }}</p>
                  </td>
                  <td class="whitespace-nowrap px-3 py-4"><UBadge color="neutral" variant="soft">{{ item.type }}</UBadge></td>
                  <td class="whitespace-nowrap px-3 py-4 text-slate-300">{{ item.priority || '—' }}</td>
                  <td class="whitespace-nowrap px-3 py-4 text-slate-400">{{ formatDate(item.changedDate) }}</td>
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

          <p v-if="!assignedPending && activeProject && !assignedItems.length" class="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">
            No assigned work items in this project.
          </p>
        </UCard>

        <template v-else>
          <UCard variant="subtle" class="bg-white/5 ring-white/10">
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-white">Quick create</h2>
                <p class="text-sm text-slate-400">Creates inside <span class="font-medium text-white">{{ activeProject || 'selected project' }}</span>. PAT stays server-side.</p>
              </div>
            </template>

            <form class="grid gap-4 lg:grid-cols-12" @submit.prevent="createItem">
              <UFormField label="Title" class="lg:col-span-4">
                <UInput v-model="form.title" placeholder="Fix flaky release checklist" :disabled="!activeProject" />
              </UFormField>

              <UFormField label="Type" class="lg:col-span-2">
                <USelect v-model="form.type" :items="workItemTypes" :disabled="!activeProject" />
              </UFormField>

              <UFormField label="Assigned to" class="lg:col-span-3">
                <UInput v-model="form.assignedTo" placeholder="name@company.com" :disabled="!activeProject" />
              </UFormField>

              <UFormField label="Tags" class="lg:col-span-3">
                <UInput v-model="form.tags" placeholder="auzura, dx" :disabled="!activeProject" />
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
              class="min-h-96 bg-white/5 ring-white/10"
            >
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="font-semibold text-white">{{ column.state }}</h2>
                  <UBadge color="neutral" variant="soft">{{ column.items.length }}</UBadge>
                </div>
              </template>

              <div class="space-y-3">
                <USkeleton v-if="boardPending" v-for="index in 3" :key="index" class="h-28" />

                <UCard v-for="item in column.items" v-else :key="item.id" variant="soft" class="bg-slate-950/60">
                  <div class="space-y-3">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p class="text-xs text-slate-400">#{{ item.id }} · {{ item.type }}</p>
                        <button class="text-left font-medium text-white hover:text-primary-300" @click="openDetail(item)">
                          {{ item.title }}
                        </button>
                      </div>
                      <UBadge v-if="item.tags[0]" color="primary" variant="soft">{{ item.tags[0] }}</UBadge>
                    </div>

                    <p v-if="item.assignedTo" class="text-xs text-slate-400">Assigned: {{ item.assignedTo }}</p>

                    <USelectMenu :model-value="item.state" :items="states" size="xs" @update:model-value="moveItem(item, String($event))" />
                  </div>
                </UCard>

                <p v-if="!boardPending && activeProject && !column.items.length" class="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
                  No recent items.
                </p>
              </div>
            </UCard>
          </section>
        </template>
      </div>
    </div>

    <UModal v-model:open="isDetailOpen" :title="selectedItem ? `#${selectedItem.id} ${selectedItem.title}` : 'Work item detail'" :description="activeProject">
      <template #body>
        <div v-if="detailPending" class="space-y-4">
          <USkeleton class="h-8" />
          <USkeleton class="h-40" />
        </div>

        <div v-else-if="selectedItem" class="space-y-5">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge color="neutral" variant="soft">{{ selectedItem.type }}</UBadge>
            <UBadge color="primary" variant="soft">{{ selectedItem.state }}</UBadge>
            <UBadge v-if="selectedItem.priority" color="warning" variant="soft">P{{ selectedItem.priority }}</UBadge>
            <UBadge v-for="tag in selectedItem.tags" :key="tag" color="neutral" variant="outline">{{ tag }}</UBadge>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-lg border border-white/10 p-3">
              <p class="text-xs text-slate-500">Assigned to</p>
              <p class="text-sm text-white">{{ selectedItem.assignedTo || 'Unassigned' }}</p>
            </div>
            <div class="rounded-lg border border-white/10 p-3">
              <p class="text-xs text-slate-500">Changed</p>
              <p class="text-sm text-white">{{ formatDate(selectedItem.changedDate) }}</p>
            </div>
            <div class="rounded-lg border border-white/10 p-3">
              <p class="text-xs text-slate-500">Area</p>
              <p class="text-sm text-white">{{ selectedItem.areaPath || '—' }}</p>
            </div>
            <div class="rounded-lg border border-white/10 p-3">
              <p class="text-xs text-slate-500">Iteration</p>
              <p class="text-sm text-white">{{ selectedItem.iterationPath || '—' }}</p>
            </div>
          </div>

          <UFormField label="Status">
            <USelectMenu :model-value="selectedItem.state" :items="states" @update:model-value="moveItem(selectedItem, String($event))" />
          </UFormField>

          <div class="space-y-2">
            <h3 class="font-semibold text-white">Description</h3>
            <p class="whitespace-pre-wrap rounded-lg border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-300">
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
  </main>
</template>
