<script setup lang="ts">
// --- Imports and composables (shared with WorkspaceView.vue, but only those needed for sprint-task) ---
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
import type {
  AzureSprint,
  AzureTeam,
  AzureUser,
  AzureWorkItem,
  AzureWorkItemRelation,
} from "~/types/azure-devops";

// --- State and logic (extracted and trimmed for sprint-task section) ---
const route = useRoute();
const router = useRouter();
const toast = useToast();
const { loggedIn } = useUserSession();

const selectedOrganization = useCookie<string>("auzura:organization", {
  default: () => "",
});
const selectedProject = useCookie<string>("auzura:selected-project", {
  default: () => "",
});
const selectedTeam = useCookie<string>("auzura:selected-team", {
  default: () => "",
});
const selectedSprintPath = useCookie<string>("auzura:selected-sprint-path", {
  default: () => "",
});

const searchKeyword = ref("");
const assignedMembers = ref<string[]>([]);
const createdMembers = ref<string[]>([]);

const activeOrganization = computed(() => selectedOrganization.value.trim());
const activeProject = computed(() => selectedProject.value);

function withOrganizationQuery(path: string) {
  return `${path}${activeOrganization.value ? `&organization=${encodeURIComponent(activeOrganization.value)}` : ""}`;
}

const userOptions = ref<string[]>([]); // For simplicity, not fetching users here
const teamOptions = ref<string[]>([]); // For simplicity, not fetching teams here
const sprintOptions = ref<string[]>([]); // For simplicity, not fetching sprints here

const assignedFilterValue = computed(() =>
  assignedMembers.value.length ? assignedMembers.value : undefined,
);
const createdFilterValue = computed(() =>
  createdMembers.value.length ? createdMembers.value : undefined,
);

const sprintItems = ref<AzureWorkItem[]>([]);
const sprintItemsPending = ref(false);

// --- Fetch sprint items (simulate, should use useFetch/useAsyncData in real code) ---
// ...

// --- Helper functions (childItems, relatedItems, etc.) ---
function relationTargetId(relation: AzureWorkItemRelation): number | undefined {
  const match = relation.url?.match(/workItems\/(\d+)$/i);
  if (!match?.[1]) return undefined;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : undefined;
}
function relationItems(
  item: AzureWorkItem,
  relationType: string,
): AzureWorkItem[] {
  const relatedById = new Map(
    (item.relatedItems ?? []).map((relatedItem) => [
      relatedItem.id,
      relatedItem,
    ]),
  );
  return (item.relations ?? [])
    .filter((relation) => relation.rel === relationType)
    .map((relation) => {
      const id = relationTargetId(relation);
      return id ? relatedById.get(id) : undefined;
    })
    .filter((relatedItem): relatedItem is AzureWorkItem =>
      Boolean(relatedItem),
    );
}
function childItems(item: AzureWorkItem): AzureWorkItem[] {
  return relationItems(item, "System.LinkTypes.Hierarchy-Forward");
}
function relatedItems(item: AzureWorkItem): AzureWorkItem[] {
  return relationItems(item, "System.LinkTypes.Related");
}
function totalRelations(item: AzureWorkItem): number {
  return childItems(item).length + relatedItems(item).length;
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
function storyPointValue(item: AzureWorkItem): number | undefined {
  return item.effort;
}

// --- UI Template (extracted from WorkspaceView.vue, only sprint-task section) ---
</script>

<template>
  <div class="space-y-3">
    <div class="grid gap-3 lg:grid-cols-12">
      <UFormField label="Search" class="lg:col-span-4">
        <UInput
          v-model="searchKeyword"
          icon="i-lucide-search"
          placeholder="Keyword, title, assignee, or #383"
        />
      </UFormField>
      <UFormField label="Assignee" class="lg:col-span-4">
        <UInputMenu
          v-model="assignedMembers"
          icon="i-lucide-user"
          :items="userOptions"
          placeholder="Anyone"
          multiple
          create-item
        />
      </UFormField>
      <UFormField label="Reporter" class="lg:col-span-4">
        <UInputMenu
          v-model="createdMembers"
          icon="i-lucide-user-pen"
          :items="userOptions"
          placeholder="Anyone"
          multiple
          create-item
        />
      </UFormField>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
      <UFormField label="Team">
        <USelectMenu
          v-model="selectedTeam"
          :items="teamOptions"
          placeholder="Team"
          class="w-full"
          searchable
        />
      </UFormField>
      <UFormField label="Sprint">
        <USelectMenu
          v-model="selectedSprintPath"
          :items="sprintOptions"
          placeholder="Sprint iteration"
          class="w-full"
          searchable
        />
      </UFormField>
    </div>

    <div v-if="sprintItemsPending" class="space-y-3">
      <USkeleton v-for="index in 4" :key="index" class="h-24" />
    </div>

    <div v-else-if="sprintItems.length" class="space-y-3">
      <UCollapsible
        v-for="item in sprintItems"
        :key="item.id"
        :default-open="false"
        class="rounded-xl border border-default bg-default/50"
      >
        <template #default="{ open }">
          <button
            class="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-elevated/40"
          >
            <div class="min-w-0 space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge color="primary" variant="soft">AB#{{ item.id }}</UBadge>
                <UBadge color="neutral" variant="soft">{{ item.type }}</UBadge>
                <UBadge :color="stateColor(item.state)" variant="soft">{{
                  item.state
                }}</UBadge>
                <UBadge color="info" variant="soft"
                  >Effort {{ formatNumberValue(item.effort) }}</UBadge
                >
                <UBadge
                  v-if="totalRelations(item)"
                  color="neutral"
                  variant="outline"
                  >{{ totalRelations(item) }} linked</UBadge
                >
              </div>
              <p class="truncate text-sm font-semibold text-highlighted">
                {{ item.title }}
              </p>
              <p class="truncate text-xs text-muted">
                {{ item.assignedTo || "Unassigned" }} ·
                {{ item.iterationPath || "No iteration" }}
              </p>
            </div>
            <UIcon
              :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="mt-1 size-4 text-muted"
            />
          </button>
        </template>
        <template #content>
          <div class="space-y-4 border-t border-default p-4">
            <div>
              <h3 class="mb-2 text-xs font-semibold uppercase text-muted">
                Child tasks
              </h3>
              <div v-if="childItems(item).length" class="space-y-2">
                <div
                  v-for="child in childItems(item)"
                  :key="child.id"
                  class="flex items-center justify-between gap-3 rounded-lg border border-default bg-elevated/30 px-3 py-2"
                >
                  <button
                    class="min-w-0 truncate text-left text-sm text-highlighted hover:text-primary"
                  >
                    AB#{{ child.id }} · {{ child.title }}
                  </button>
                  <div class="flex shrink-0 items-center gap-2">
                    <UBadge color="info" variant="soft"
                      >SP
                      {{ formatNumberValue(storyPointValue(child)) }}</UBadge
                    >
                    <UBadge color="neutral" variant="soft">{{
                      child.type
                    }}</UBadge>
                    <UBadge :color="stateColor(child.state)" variant="soft">{{
                      child.state
                    }}</UBadge>
                  </div>
                </div>
              </div>
              <p
                v-else
                class="rounded-lg border border-dashed border-default p-3 text-sm text-muted"
              >
                No child task linked.
              </p>
            </div>
            <div>
              <h3 class="mb-2 text-xs font-semibold uppercase text-muted">
                Related issues
              </h3>
              <div v-if="relatedItems(item).length" class="space-y-2">
                <div
                  v-for="related in relatedItems(item)"
                  :key="related.id"
                  class="flex items-center justify-between gap-3 rounded-lg border border-default bg-elevated/30 px-3 py-2"
                >
                  <button
                    class="min-w-0 truncate text-left text-sm text-highlighted hover:text-primary"
                  >
                    AB#{{ related.id }} · {{ related.title }}
                  </button>
                  <div class="flex shrink-0 items-center gap-2">
                    <UBadge color="neutral" variant="soft">{{
                      related.type
                    }}</UBadge>
                    <UBadge :color="stateColor(related.state)" variant="soft">{{
                      related.state
                    }}</UBadge>
                  </div>
                </div>
              </div>
              <p
                v-else
                class="rounded-lg border border-dashed border-default p-3 text-sm text-muted"
              >
                No related issue linked.
              </p>
            </div>
          </div>
        </template>
      </UCollapsible>
    </div>

    <p
      v-else
      class="rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted"
    >
      No PBI/story in this sprint yet.
    </p>
  </div>
</template>
