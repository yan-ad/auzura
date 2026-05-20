<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  loggedIn: boolean
  displayName?: string
  email?: string
  avatarUrl?: string
  items: DropdownMenuItem[][]
}>()

function getInitials(displayName?: string, email?: string): string {
  const source = String(displayName || email || '').trim()
  if (!source) return 'U'

  const parts = source
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase()
  }

  return (parts[0]?.slice(0, 2) || 'U').toUpperCase()
}
</script>

<template>
  <div class="mt-6 space-y-4 rounded-xl border border-default bg-default/60 p-3">
    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <UAvatar
          :src="avatarUrl"
          :alt="displayName || email || 'User'"
          :text="getInitials(displayName, email)"
          size="sm"
        />
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-highlighted">
            {{ loggedIn ? (displayName || email || 'Signed in') : 'Sign in required' }}
          </p>
          <p class="truncate text-xs text-muted">{{ email || 'Microsoft account' }}</p>
        </div>
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
