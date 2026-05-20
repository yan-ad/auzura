<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  activeOrganization: string
  items: DropdownMenuItem[][]
}>()
</script>

<template>
  <div class="mt-4 space-y-4 rounded-xl border border-default bg-default/60 p-3">
    <UFormField label="Workspace" help="Switch organization and project quickly.">
      <UDropdownMenu
        :items="items"
        :content="{ align: 'start', collisionPadding: 12 }"
        :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width)' }"
      >
        <UButton
          color="neutral"
          variant="ghost"
          block
          class="data-[state=open]:bg-elevated"
          :label="activeOrganization || 'Select organization'"
          trailing-icon="i-lucide-chevrons-up-down"
          :ui="{ leadingIcon: 'text-dimmed', trailingIcon: 'text-dimmed' }"
        >
          <template #leading>
            <UIcon name="i-lucide-building-2" class="size-4" />
          </template>
        </UButton>
      </UDropdownMenu>
    </UFormField>
  </div>
</template>
