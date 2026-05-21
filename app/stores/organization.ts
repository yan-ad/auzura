import { defineStore } from "pinia";
import { ref } from "vue";
import type { AzureOrganization, AzureProject } from "~/types/azure-devops";

export const useOrganizationStore = defineStore("organization", () => {
  const organizations = ref<AzureOrganization[]>([]);
  const projects = ref<AzureProject[]>([]);
  const loading = ref(false);
  const error = ref<Error | null>(null);
  const selectedOrganization = ref("");
  const selectedProject = ref("");

  async function fetchOrganizations() {
    loading.value = true;
    error.value = null;
    try {
      const data = await $fetch<{ organizations: AzureOrganization[] }>(
        "/api/azure/organizations",
      );
      organizations.value = data.organizations ?? [];
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      loading.value = false;
    }
  }

  async function fetchProjects(organization: string) {
    loading.value = true;
    error.value = null;
    try {
      const data = await $fetch<{ projects: AzureProject[] }>(
        `/api/azure/projects?organization=${encodeURIComponent(organization)}`,
      );
      projects.value = data.projects ?? [];
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      loading.value = false;
    }
  }

  return {
    organizations,
    projects,
    loading,
    error,
    selectedOrganization,
    selectedProject,
    fetchOrganizations,
    fetchProjects,
  };
});
