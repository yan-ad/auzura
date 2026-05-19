<script setup lang="ts">
import type { AzureWorkItem } from '~/types/azure-devops'

const toast = useToast()
const states = ['New', 'Active', 'Resolved', 'Closed']
const workItemTypes = ['User Story', 'Task', 'Bug']

const form = reactive({
  title: '',
  type: 'Task',
  description: '',
  assignedTo: '',
  tags: 'auzura'
})

const { data, pending, error, refresh } = await useFetch<{ items: AzureWorkItem[] }>('/api/azure/work-items')

const columns = computed(() => {
  const items = data.value?.items ?? []

  return states.map((state) => ({
    state,
    items: items.filter((item) => item.state === state)
  }))
})

async function createItem() {
  if (!form.title.trim()) {
    toast.add({ title: 'Title required', color: 'warning' })
    return
  }

  await $fetch('/api/azure/work-items', {
    method: 'POST',
    body: {
      title: form.title,
      type: form.type,
      description: form.description || undefined,
      assignedTo: form.assignedTo || undefined,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    }
  })

  toast.add({ title: 'Work item created', color: 'success' })
  form.title = ''
  form.description = ''
  await refresh()
}

async function moveItem(item: AzureWorkItem, state: string) {
  await $fetch(`/api/azure/work-items/${item.id}/state`, {
    method: 'PATCH',
    body: { state }
  })

  toast.add({ title: `Moved #${item.id} to ${state}`, color: 'success' })
  await refresh()
}
</script>

<template>
  <main class="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
    <div class="mx-auto flex max-w-7xl flex-col gap-8">
      <section class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div class="space-y-3">
          <UBadge color="primary" variant="soft" size="lg">Azure Boards without the Azure DX pain</UBadge>
          <h1 class="max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-6xl">
            Auzura
          </h1>
          <p class="max-w-2xl text-lg text-slate-300">
            Thin, fast Nuxt 4 control surface for Azure DevOps Boards: list recent work items,
            create new tasks, and move states without digging through DevOps UI.
          </p>
        </div>

        <UButton icon="i-lucide-refresh-cw" :loading="pending" color="neutral" variant="subtle" @click="refresh()">
          Refresh
        </UButton>
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
            <p class="text-sm text-slate-400">Uses the server-side PAT proxy, so the token never reaches the browser.</p>
          </div>
        </template>

        <form class="grid gap-4 lg:grid-cols-12" @submit.prevent="createItem">
          <UFormField label="Title" class="lg:col-span-4">
            <UInput v-model="form.title" placeholder="Fix flaky release checklist" />
          </UFormField>

          <UFormField label="Type" class="lg:col-span-2">
            <USelect v-model="form.type" :items="workItemTypes" />
          </UFormField>

          <UFormField label="Assigned to" class="lg:col-span-3">
            <UInput v-model="form.assignedTo" placeholder="name@company.com" />
          </UFormField>

          <UFormField label="Tags" class="lg:col-span-3">
            <UInput v-model="form.tags" placeholder="auzura, dx" />
          </UFormField>

          <UFormField label="Description" class="lg:col-span-10">
            <UTextarea v-model="form.description" autoresize placeholder="What should happen?" />
          </UFormField>

          <div class="flex items-end lg:col-span-2">
            <UButton type="submit" block icon="i-lucide-plus">Create</UButton>
          </div>
        </form>
      </UCard>

      <section class="grid gap-4 lg:grid-cols-4">
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

            <p v-if="!pending && !column.items.length" class="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
              No recent items.
            </p>
          </div>
        </UCard>
      </section>
    </div>
  </main>
</template>
