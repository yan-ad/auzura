<script setup lang="ts">
import { ref, computed } from "vue";
import { useCookie } from "#imports";

const selectedOrganization = useCookie<string>("auzura:organization", {
  default: () => "",
});
const selectedProject = useCookie<string>("auzura:selected-project", {
  default: () => "",
});
const activeOrganization = computed(() => selectedOrganization.value.trim());
const activeProject = computed(() => selectedProject.value);

type BadgeColor =
  | "primary"
  | "secondary"
  | "success"
  | "info"
  | "warning"
  | "error"
  | "neutral";

// Dummy dashboard stats and chart sections for illustration
const dashboardStats = ref<
  Array<{
    title: string;
    icon: string;
    value: string | number;
    tone: BadgeColor;
  }>
>([
  {
    title: "Cached tasks",
    icon: "i-lucide-database",
    value: 42,
    tone: "primary",
  },
  { title: "This page", icon: "i-lucide-list-checks", value: 10, tone: "info" },
  {
    title: "Active project",
    icon: "i-lucide-folder-kanban",
    value: activeProject.value || "—",
    tone: "success",
  },
  {
    title: "Azure organization",
    icon: "i-lucide-building-2",
    value: activeOrganization.value || "—",
    tone: "neutral",
  },
]);
const chartSections = ref([
  {
    title: "State breakdown",
    icon: "i-lucide-chart-no-axes-column",
    items: [{ label: "Active", count: 10, percent: 50 }],
  },
  {
    title: "Work item types",
    icon: "i-lucide-shapes",
    items: [{ label: "Task", count: 5, percent: 25 }],
  },
  {
    title: "Top assignees",
    icon: "i-lucide-users",
    items: [{ label: "Alice", count: 3, percent: 15 }],
  },
  {
    title: "Freshness",
    icon: "i-lucide-clock-3",
    items: [{ label: "Today", count: 2, percent: 10 }],
  },
]);
</script>

<template>
  <UPageGrid class="gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <UPageCard
      v-for="stat in dashboardStats"
      :key="stat.title"
      :icon="stat.icon"
      :title="stat.title"
      variant="subtle"
      :ui="{
        container: 'gap-y-1',
        wrapper: 'items-start',
        leading:
          'p-2 rounded-full bg-primary/10 ring ring-inset ring-primary/25',
        title: 'font-normal text-muted text-xs uppercase',
      }"
      class="min-h-0"
    >
      <div class="flex items-center gap-2">
        <span class="truncate text-xl font-semibold text-highlighted">{{
          stat.value
        }}</span>
        <UBadge :color="stat.tone" variant="subtle" class="text-xs"
          >live</UBadge
        >
      </div>
    </UPageCard>
  </UPageGrid>
  <UCard variant="subtle">
    <template #header>
      <div
        class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 class="text-lg font-semibold text-highlighted">
            Dashboard graphics
          </h2>
          <p class="text-sm text-muted">
            MongoDB Atlas cache · synced just now
          </p>
        </div>
        <UBadge color="neutral" variant="soft">MongoDB Atlas</UBadge>
      </div>
    </template>
    <div class="grid gap-4 lg:grid-cols-2">
      <div
        v-for="section in chartSections"
        :key="section.title"
        class="rounded-xl border border-default bg-default/40 p-4"
      >
        <div class="mb-4 flex items-center gap-2">
          <UIcon :name="section.icon" class="size-4 text-primary" />
          <h3 class="text-sm font-semibold text-highlighted">
            {{ section.title }}
          </h3>
        </div>
        <div v-if="section.items.length" class="space-y-3">
          <div
            v-for="item in section.items"
            :key="item.label"
            class="space-y-1.5"
          >
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="truncate text-toned">{{ item.label }}</span>
              <span class="font-medium text-highlighted">{{ item.count }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-elevated">
              <div
                class="h-full rounded-full bg-primary transition-all"
                :style="{ width: `${Math.max(item.percent, 4)}%` }"
              />
            </div>
          </div>
        </div>
        <p
          v-else
          class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted"
        >
          Belum ada cache. Refresh Tasks dulu buat populate MongoDB Atlas.
        </p>
      </div>
    </div>
  </UCard>
</template>
