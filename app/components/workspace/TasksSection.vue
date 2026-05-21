<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import {
  useRoute,
  useRouter,
  useAsyncData,
  useFetch,
  useCookie,
  useUserSession,
  useToast,
} from "#imports";
import {
  buildProjectSectionPath,
  buildProjectStateQuery,
  getRouteProjectParams,
  isKnownAssetRequestPath,
  isProjectRoute,
  normalizeRouteProjectName,
  getProjectSectionFromPath,
} from "~/utils/navigation";
import { azureDataKey } from "~/utils/azure-data-keys";
import type { AzureWorkItem } from "~/types/azure-devops";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { loggedIn } = useUserSession();

import { storeToRefs } from "pinia";
import { useOrganizationStore } from "~/stores/organization";

const organizationStore = useOrganizationStore();
const {
  organizations,
  projects,
  loading,
  error,
  selectedOrganization,
  selectedProject,
} = storeToRefs(organizationStore);

organizationStore.fetchOrganizations();
watch(selectedOrganization, (org) => {
  if (org) organizationStore.fetchProjects(org);
});

const searchKeyword = ref("");
const assignedMembers = ref<string[]>([]);
const createdMembers = ref<string[]>([]);
const itemsPerPage = ref(50);
const itemsPerPageOptions = [25, 50, 100];
const listPage = ref(1);

const activeOrganization = computed(() => selectedOrganization.value.trim());
const activeProject = computed(() => selectedProject.value);

const userOptions = ref<string[]>([]); // For simplicity, not fetching users here

const assignedFilterValue = computed(() =>
  assignedMembers.value.length ? assignedMembers.value : undefined,
);
const createdFilterValue = computed(() =>
  createdMembers.value.length ? createdMembers.value : undefined,
);

const boardItems = ref<AzureWorkItem[]>([]);
const boardPending = ref(false);
const listTotal = ref(0);
const listPageCount = computed(() =>
  Math.max(Math.ceil(listTotal.value / itemsPerPage.value), 1),
);
const canGoPrevious = computed(() => listPage.value > 1);
const canGoNext = computed(() => listPage.value < listPageCount.value);

function previousPage() {
  if (canGoPrevious.value) listPage.value -= 1;
}
function nextPage() {
  if (canGoNext.value) listPage.value += 1;
}

function stateColor(state?: string) {
  if (state === "Closed") return "success";
  if (state === "Resolved") return "info";
  if (state === "Active") return "warning";
  if (state === "Released") return "success";
  return "neutral";
}
function formatNumberValue(value?: number) {
  return value === undefined || value === null ? "-" : String(value);
}
function storyPointLabel(item: AzureWorkItem): string {
  return item.type.trim().toLowerCase() === "task" ? "Estimated SP" : "Effort";
}
function storyPointValue(item: AzureWorkItem): number | undefined {
  return item.type.trim().toLowerCase() === "task" ?
      (item.estimatedStoryPoints ?? item.effort)
    : item.effort;
}
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default">
    <div
      class="grid grid-cols-[112px_minmax(280px,1fr)_140px_96px_170px_170px_150px_88px] items-center gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-[11px] font-medium uppercase text-muted"
    >
      <span>Issue Key</span>
      <span>Summary</span>
      <span>Type</span>
      <span>SP / Effort</span>
      <span>Assignee</span>
      <span>Reporter</span>
      <span>Updated</span>
      <span class="text-right">Open</span>
    </div>
    <div v-if="boardPending" class="space-y-2 p-3">
      <USkeleton v-for="index in 6" :key="index" class="h-12" />
    </div>
    <div v-else class="divide-y divide-default">
      <div
        v-for="item in boardItems"
        :key="item.id"
        class="grid grid-cols-[112px_minmax(280px,1fr)_140px_96px_170px_170px_150px_88px] items-center gap-2 px-3 py-2 hover:bg-elevated/40"
      >
        <button
          class="truncate text-left text-xs font-medium text-primary hover:underline"
        >
          AB#{{ item.id }}
        </button>
        <div class="min-w-0">
          <button
            class="w-full truncate text-left text-sm font-medium text-highlighted hover:text-primary"
          >
            {{ item.title }}
          </button>
          <p class="truncate text-xs text-muted">
            {{ item.areaPath || item.iterationPath || "No area / iteration" }}
          </p>
        </div>
        <UBadge color="neutral" variant="soft" class="w-fit">{{
          item.type
        }}</UBadge>
        <p class="truncate text-sm text-toned">
          {{ storyPointLabel(item) }}:
          {{ formatNumberValue(storyPointValue(item)) }}
        </p>
        <p class="truncate text-sm text-toned">
          {{ item.assignedTo || "Unassigned" }}
        </p>
        <p class="truncate text-sm text-toned">{{ item.createdBy || "—" }}</p>
        <div class="space-y-1">
          <p class="text-xs text-muted">{{ item.changedDate }}</p>
          <USelectMenu
            :model-value="item.state"
            :items="['New', 'Active', 'Resolved', 'Closed']"
            size="xs"
          />
        </div>
        <div class="flex justify-end">
          <UButton
            icon="i-lucide-panel-right-open"
            color="neutral"
            variant="ghost"
            size="xs"
            square
          />
        </div>
      </div>
    </div>
    <div
      class="mt-4 flex flex-col gap-3 border-t border-default pt-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p class="text-sm text-muted">
        Page {{ listPage }} of {{ listPageCount }} · {{ listTotal }} total
      </p>
      <div class="flex gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="subtle"
          :disabled="!canGoPrevious || boardPending"
          @click="previousPage()"
          >Previous</UButton
        >
        <UButton
          trailing-icon="i-lucide-chevron-right"
          color="neutral"
          variant="subtle"
          :disabled="!canGoNext || boardPending"
          @click="nextPage()"
          >Next</UButton
        >
      </div>
    </div>
    <p
      v-if="!boardPending && activeProject && !boardItems.length"
      class="mt-4 rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted"
    >
      No work items match this filter.
    </p>
  </div>
</template>
