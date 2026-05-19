<script setup lang="ts">
import type { AzureProject, AzureWorkItem } from '~/types/azure-devops'

const toast = useToast()
const states = ['New', 'Active', 'Resolved', 'Closed']
const workItemTypes = ['User Story', 'Task', 'Bug']
const selectedProject = useCookie<string>('auzura:selected-project', { default: () => '' })

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

const workItemsUrl = computed(() => `/api/azure/work-items?project=${encodeURIComponent(activeProject.value)}`)

const { data, pending, error, refresh } = await useFetch<{ items: AzureWorkItem[] }>(workItemsUrl, {
  immediate: false,
  watch: false
})

watch(activeProject, async (project) => {
  if (project) {
    await refresh()
  }
}, { immediate: true })

const columns = computed(() => {
  const items = data.value?.items ?? []

  return states.map((state) => ({
    state,
    items: items.filter((item) => item.state === state)
  }))
})

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
  await refresh()
}

async function moveItem(item: AzureWorkItem, state: string) {
  if (!activeProject.value) {
    toast.add({ title: 'Pick a project first', color: 'warning' })
    return
  }

  await $fetch(`/api/azure/work-items/${item.id}/state?project=${encodeURIComponent(activeProject.value)}`, {
    method: 'PATCH',
    body: { state }
  })

  toast.add({ title: `Moved #${item.id} to ${state}`, description: activeProject.value, color: 'success' })
  await refresh()
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
              <p class="text-sm text-slate-400">Pilih project dulu, baru work items-nya ditarik.</p>
            </div>
          </template>

          <div class="space-y-4">
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

            <div class="rounded-lg border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-300">
              <p class="text-xs uppercase tracking-wide text-slate-500">Active project</p>
              <p class="mt-1 font-medium text-white">{{ activeProject || 'No project selected' }}</p>
            </div>

            <UButton icon="i-lucide-refresh-cw" :loading="pending" color="neutral" variant="subtle" block :disabled="!activeProject" @click="refresh()">
              Refresh board
            </UButton>
          </div>
        </UCard>
      </aside>

      <div class="flex flex-col gap-8">
        <section class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div class="space-y-3">
            <UBadge color="primary" variant="soft" size="lg">Azure Boards without the Azure DX pain</UBadge>
            <h2 class="max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-6xl">
              {{ activeProject || 'Pick a project' }}
            </h2>
            <p class="max-w-2xl text-lg text-slate-300">
              Thin, fast Nuxt 4 control surface for Azure DevOps Boards: list recent work items,
              create new tasks, and move states without digging through DevOps UI.
            </p>
          </div>
        </section>

        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          title="Azure DevOps is not ready yet"
          :description="error.message"
        />

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
              <USkeleton v-if="pending" v-for="index in 3" :key="index" class="h-28" />

              <UCard v-for="item in column.items" v-else :key="item.id" variant="soft" class="bg-slate-950/60">
                <div class="space-y-3">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-xs text-slate-400">#{{ item.id }} · {{ item.type }}</p>
                      <NuxtLink :to="item.webUrl" target="_blank" class="font-medium text-white hover:text-primary-300">
                        {{ item.title }}
                      </NuxtLink>
                    </div>
                    <UBadge v-if="item.tags[0]" color="primary" variant="soft">{{ item.tags[0] }}</UBadge>
                  </div>

                  <p v-if="item.assignedTo" class="text-xs text-slate-400">Assigned: {{ item.assignedTo }}</p>

                  <USelectMenu
                    :model-value="item.state"
                    :items="states"
                    size="xs"
                    @update:model-value="moveItem(item, String($event))"
                  />
                </div>
              </UCard>

              <p v-if="!pending && activeProject && !column.items.length" class="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
                No recent items.
              </p>

              <p v-if="!activeProject" class="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
                Pick a project from the sidebar.
              </p>
            </div>
          </UCard>
        </section>
      </div>
    </div>
  </main>
</template>
