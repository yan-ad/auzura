<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

const props = defineProps<{
  activeOrganization: string;
  items: DropdownMenuItem[][];
  collapsed?: boolean;
}>();

const organizationInitials = computed(() => {
  const source = String(props.activeOrganization || "").trim();
  if (!source) return "--";

  const words = source
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0]?.[0] || ""}${words[1]?.[0] || ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
});
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{
      content: collapsed ? 'w-40' : 'w-(--reka-dropdown-menu-trigger-width)',
    }"
  >
    <UButton
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :class="[!collapsed && 'py-2']"
      :ui="{
        trailingIcon: 'text-dimmed',
      }"
    >
      <span
        class="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-[11px] font-semibold text-primary"
      >
        {{ organizationInitials }}
      </span>
      <span v-if="!collapsed" class="truncate">{{ activeOrganization }}</span>
    </UButton>
  </UDropdownMenu>
</template>
