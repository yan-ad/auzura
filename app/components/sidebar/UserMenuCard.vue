<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  loggedIn: boolean
  displayName?: string
  email?: string
  items: DropdownMenuItem[][]
}>()
</script>

<template>
  <div class="mt-6 space-y-4 rounded-xl border border-default bg-default/60 p-3">
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-highlighted">
          {{ loggedIn ? (displayName || email || 'Signed in') : 'Sign in required' }}
        </p>
        <p class="truncate text-xs text-muted">{{ email || 'Microsoft account' }}</p>
      </div>

      <UDropdownMenu :items="items" :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-ellipsis-vertical"
          color="neutral"
          variant="ghost"
          square
          aria-label="User menu"
        />
      </UDropdownMenu>
    </div>
  </div>
</template>
