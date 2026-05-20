<script setup lang="ts">
import type { AzureSprint, AzureWorkItem } from '~/types/azure-devops'

defineProps<{
  selectedTeam: string
  selectedSprintPath: string
  teamOptions: string[]
  sprintOptions: string[]
  teamsPending: boolean
  sprintsPending: boolean
  sprintItemsPending: boolean
  sprintItems: AzureWorkItem[]
  selectedSprint?: AzureSprint
  formatSprintRange: (sprint?: AzureSprint) => string
}>()

const emit = defineEmits<{
  (event: 'update:selectedTeam', value: string): void
  (event: 'update:selectedSprintPath', value: string): void
  (event: 'openDetail', item: AzureWorkItem): void
}>()
</script>

<template>
  <div class="mt-4 space-y-4 rounded-xl border border-default bg-default/60 p-3">
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-flag" class="size-4 text-primary" />
      <p class="text-xs font-medium uppercase tracking-wide text-muted">Sprints</p>
    </div>

    <UFormField label="Team Sprint">
      <USelectMenu
        :model-value="selectedTeam"
        :items="teamOptions"
        :loading="teamsPending"
        icon="i-lucide-users"
        placeholder="Select team"
        searchable
        @update:model-value="emit('update:selectedTeam', $event)"
      />
    </UFormField>

    <UFormField label="Sprint">
      <USelectMenu
        :model-value="selectedSprintPath"
        :items="sprintOptions"
        :loading="sprintsPending"
        icon="i-lucide-calendar-range"
        placeholder="Select sprint"
        searchable
        @update:model-value="emit('update:selectedSprintPath', $event)"
      />
    </UFormField>

    <div class="rounded-lg border border-default bg-elevated/60 px-3 py-2">
      <p class="text-xs text-muted">{{ selectedSprint?.timeFrame || "unknown timeframe" }}</p>
      <p class="text-xs text-muted">{{ formatSprintRange(selectedSprint) }}</p>
    </div>

    <div class="space-y-2">
      <p class="text-xs font-medium text-muted">PBI in sprint ({{ sprintItems.length }})</p>
      <div
        v-if="sprintItemsPending"
        class="rounded-lg border border-default bg-elevated/60 px-3 py-2 text-xs text-muted"
      >
        Loading sprint items...
      </div>
      <div
        v-else-if="!sprintItems.length"
        class="rounded-lg border border-default bg-elevated/60 px-3 py-2 text-xs text-muted"
      >
        No PBI found in selected sprint.
      </div>
      <div v-else class="max-h-48 space-y-1 overflow-auto">
        <button
          v-for="item in sprintItems.slice(0, 12)"
          :key="item.id"
          type="button"
          class="w-full rounded-md border border-default bg-elevated/60 px-2 py-1 text-left text-xs hover:bg-elevated"
          @click="emit('openDetail', item)"
        >
          <span class="font-medium text-highlighted">#{{ item.id }}</span>
          <span class="ml-1 text-toned">{{ item.title }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
