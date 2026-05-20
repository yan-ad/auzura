import { AsyncLocalStorage } from "node:async_hooks";
import { createError, type H3Event } from "h3";
import type {
  AzureProject,
  AzureSprint,
  AzureTeam,
  AzureUser,
  AzureWorkItem,
  AzureWorkItemInput,
  AzureWorkItemRelation,
} from "../../app/types/azure-devops";
import {
  getAzureAuthorizationHeader,
  getAzureDevOpsConnectionDataUrl,
  getAzureOAuthAccessToken,
} from "./azure-auth";
import { cacheWorkItemsForDashboard } from "./dashboard-metrics";
import { getSessionCacheOwnerFromEvent } from "./project-cache";

const API_VERSION = "7.1";
const azureOrganizationStorage = new AsyncLocalStorage<string>();
const azureEventStorage = new AsyncLocalStorage<H3Event>();

type AzureQuery = Record<string, unknown>;

type JsonPatchOperation = {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};

type AzureProjectResponse = {
  id: string;
  name: string;
  description?: string;
  url?: string;
  state?: string;
  visibility?: string;
};

type AzureWorkItemResponse = {
  id: number;
  rev?: number;
  url?: string;
  fields?: Record<string, unknown>;
  relations?: AzureWorkItemRelation[];
  _links?: {
    html?: {
      href?: string;
    };
  };
};

type AzureConnectionDataResponse = {
  authenticatedUser?: {
    providerDisplayName?: string;
    properties?: {
      Account?: { $value?: string };
      Mail?: { $value?: string };
    };
  };
};

type AzureProfileResponse = {
  id?: string;
};

type AzureAccountResponse = {
  accountId?: string;
  accountName?: string;
  accountUri?: string;
  organizationName?: string;
};

export type AzureGraphUserResponse = {
  subjectKind?: string;
  displayName?: string;
  principalName?: string;
  mailAddress?: string;
  descriptor?: string;
  url?: string;
  _links?: {
    avatar?: {
      href?: string;
    };
  };
};

type AzureCollectionResponse<T> = {
  value?: T[];
  members?: T[];
  workItems?: T[];
  count?: number;
};

type AzureGraphUsersResponse = AzureCollectionResponse<AzureGraphUserResponse>;

type AzureTeamResponse = {
  id: string;
  name: string;
};

type AzureTeamIterationResponse = {
  id: string;
  name: string;
  path?: string;
  attributes?: {
    startDate?: string;
    finishDate?: string;
    timeFrame?: string;
  };
};

type FetchErrorWithData = Error & {
  status?: number;
  statusCode?: number;
  data?: {
    message?: string;
    value?: { Message?: string };
    typeName?: string;
  };
};

function getHttpStatusCode(error: unknown): number | undefined {
  const fetchError = error as FetchErrorWithData;
  return fetchError.statusCode || fetchError.status;
}

function escapeWiqlString(value: string): string {
  return value.replaceAll("'", "''");
}

export function buildWorkItemsWiql(
  options: { excludeRemoved?: boolean } = {},
): string {
  const removedClause =
    options.excludeRemoved ? " AND [System.State] <> 'Removed'" : "";
  return `
          SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [System.ChangedDate], [System.Tags]
          FROM WorkItems
          WHERE [System.TeamProject] = @project${removedClause}
          ORDER BY [System.ChangedDate] DESC
        `;
}

export type WorkItemListFilters = {
  assignedTo?: string | string[];
  createdBy?: string | string[];
  keyword?: string;
  offset?: number;
  limit?: number;
};

export type WorkItemListResult = {
  items: AzureWorkItem[];
  total: number;
  offset: number;
  limit: number;
};

function normalizeIdentityValue(value: string): string {
  return value.trim().toLowerCase();
}

function getEmailLocalPart(value: string): string | undefined {
  const match = value.match(/([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/i);
  return match?.[1]?.toLowerCase();
}

function getIdentitySearchTokens(value: string): string[] {
  const normalized = normalizeIdentityValue(value);
  const tokens = new Set([normalized]);
  const localPart = getEmailLocalPart(value);

  if (localPart) {
    tokens.add(localPart);
    tokens.add(localPart.replace(/[._-]+/g, " "));
  }

  tokens.add(normalized.replace(/[._-]+/g, " "));

  return Array.from(tokens).filter((token) => token.length >= 3);
}

function identityMatches(
  value: string | undefined,
  candidates: string[],
): boolean {
  if (!value?.trim()) return false;

  const normalizedValue = normalizeIdentityValue(value);
  const candidateTokens = candidates.flatMap(getIdentitySearchTokens);

  return candidateTokens.some((candidate) => {
    if (normalizedValue === candidate) return true;
    if (normalizedValue.includes(candidate)) return true;
    return candidate.includes(normalizedValue);
  });
}

export function isAssignedToCandidate(
  item: Pick<AzureWorkItem, "assignedTo" | "assignedToUniqueName">,
  candidates: string[],
): boolean {
  return [item.assignedToUniqueName, item.assignedTo].some((assignee) =>
    identityMatches(assignee, candidates),
  );
}

export function isCreatedByCandidate(
  item: Pick<AzureWorkItem, "createdBy">,
  candidates: string[],
): boolean {
  return identityMatches(item.createdBy, candidates);
}

function workItemMatchesKeyword(item: AzureWorkItem, keyword: string): boolean {
  const normalizedKeyword = keyword.trim().toLowerCase().replace(/^#/, "");

  if (!normalizedKeyword) return true;

  return [
    String(item.id),
    item.title,
    item.type,
    item.state,
    item.assignedTo,
    item.assignedToUniqueName,
    item.createdBy,
    item.estimatedStoryPoints === undefined ? undefined : String(item.estimatedStoryPoints),
    item.effort === undefined ? undefined : String(item.effort),
    item.areaPath,
    item.iterationPath,
    ...item.tags,
  ].some((value) => value?.toLowerCase().includes(normalizedKeyword));
}

function paginateWorkItems(
  items: AzureWorkItem[],
  filters: WorkItemListFilters,
): WorkItemListResult {
  const total = items.length;
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  return {
    items: items.slice(offset, offset + limit),
    total,
    offset,
    limit,
  };
}

function getAzureErrorMessage(error: unknown): string {
  const fetchError = error as FetchErrorWithData;
  return (
    fetchError.data?.message ||
    fetchError.data?.value?.Message ||
    fetchError.message ||
    "Azure DevOps request failed."
  );
}

function getIdentityDisplayName(value: unknown): string | undefined {
  if (typeof value === "object" && value) {
    const identity = value as { displayName?: string; uniqueName?: string };
    return identity.displayName || identity.uniqueName;
  }

  return typeof value === "string" ? value : undefined;
}

function getIdentityUniqueName(value: unknown): string | undefined {
  if (typeof value === "object" && value) {
    return (value as { uniqueName?: string }).uniqueName;
  }

  return undefined;
}

function getFieldString(
  fields: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = fields[key];
  return value === undefined || value === null || value === "" ?
      undefined
    : String(value);
}

function getFieldNumber(
  fields: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = fields[key];
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function getRuntimeConfig() {
  const runtimeGlobal = globalThis as typeof globalThis & {
    useRuntimeConfig?: () => {
      azureDevOpsOrganization?: unknown;
      public?: { azureDevOpsOrganization?: unknown };
    };
  };
  return typeof runtimeGlobal.useRuntimeConfig === "function" ?
      runtimeGlobal.useRuntimeConfig()
    : { public: {} };
}

export function getAzureOrganizationFromQuery(query: AzureQuery): string {
  const value =
    query.organization || query.org || azureOrganizationStorage.getStore();
  return Array.isArray(value) ?
      String(value[0] || "").trim()
    : String(value || "").trim();
}

export async function withAzureOrganization<T>(
  organization: string | undefined,
  callback: () => Promise<T>,
  event?: H3Event,
): Promise<T> {
  const normalized = organization?.trim();
  const runWithEvent = async () =>
    event ? await azureEventStorage.run(event, callback) : await callback();
  return normalized ?
      await azureOrganizationStorage.run(normalized, runWithEvent)
    : await runWithEvent();
}

export async function withAzureEvent<T>(
  event: H3Event | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  return event ?
      await azureEventStorage.run(event, callback)
    : await callback();
}

export function getAzureConfig(): { organization: string } {
  const organization = azureOrganizationStorage.getStore();

  if (!organization) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Azure DevOps organization is required. Set the organization query parameter.",
    });
  }

  return { organization };
}

function getOrganizationUrl(organization: string, path: string): string {
  return `https://dev.azure.com/${organization}/_apis/${path}`;
}

function getVisualStudioGraphUrl(organization: string, path: string): string {
  return `https://vssps.dev.azure.com/${organization}/_apis/graph/${path}`;
}

function getProjectUrl(
  organization: string,
  project: string,
  path: string,
): string {
  const encodedProject = encodeURIComponent(project);
  return `https://dev.azure.com/${organization}/${encodedProject}/_apis/${path}`;
}

export function buildProjectTeamsUrl(
  organization: string,
  projectId: string,
): string {
  return getOrganizationUrl(
    organization,
    `projects/${encodeURIComponent(projectId)}/teams?api-version=${API_VERSION}`,
  );
}

function getOrganizationSlug(account: AzureAccountResponse): string {
  const uriSlug = account.accountUri
    ?.match(/^https:\/\/dev\.azure\.com\/([^/]+)/i)?.[1]
    ?.trim();
  const slug = uriSlug || account.accountName || account.organizationName || "";
  return slug.trim();
}

async function azureFetch<T>(
  url: string,
  init: Parameters<typeof $fetch>[1] = {},
): Promise<T> {
  const accessToken = await getAzureOAuthAccessToken(
    azureEventStorage.getStore(),
  );

  try {
    const response = await $fetch<T>(url, {
      ...init,
      headers: {
        Authorization: getAzureAuthorizationHeader(accessToken),
        Accept: "application/json",
        ...init.headers,
      },
    });

    return response as T;
  } catch (error) {
    const fetchError = error as FetchErrorWithData;
    throw createError({
      statusCode: fetchError.statusCode || fetchError.status || 500,
      statusMessage: getAzureErrorMessage(error),
    });
  }
}

export function normalizeProject(project: AzureProjectResponse): AzureProject {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    url: project.url,
    state: project.state,
    visibility: project.visibility,
  };
}

export function normalizeUser(
  user: AzureGraphUserResponse,
): AzureUser | undefined {
  const displayName = String(
    user.displayName || user.principalName || user.mailAddress || "",
  ).trim();

  if (!displayName) return undefined;

  return {
    displayName,
    uniqueName: user.principalName,
    email: user.mailAddress || user.principalName,
    descriptor: user.descriptor,
    imageUrl: user._links?.avatar?.href,
  };
}

export function getAzureCollectionItems<T>(
  response?: AzureCollectionResponse<T> | T[],
): T[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.value)) return response.value;
  if (Array.isArray(response?.members)) return response.members;
  if (Array.isArray(response?.workItems)) return response.workItems;
  return [];
}

export function getGraphUsersFromResponse(
  response?: AzureGraphUsersResponse,
): AzureGraphUserResponse[] {
  return getAzureCollectionItems(response);
}

export function normalizeWorkItem(item: AzureWorkItemResponse): AzureWorkItem {
  const fields = item.fields ?? {};
  const tags = String(fields["System.Tags"] ?? "")
    .split(";")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    id: item.id,
    rev: item.rev,
    url: item.url,
    type: String(fields["System.WorkItemType"] ?? "Work Item"),
    title: String(fields["System.Title"] ?? `Work item #${item.id}`),
    state: String(fields["System.State"] ?? "Unknown"),
    reason: getFieldString(fields, "System.Reason"),
    priority: getFieldNumber(fields, "Microsoft.VSTS.Common.Priority"),
    severity: getFieldString(fields, "Microsoft.VSTS.Common.Severity"),
    estimatedStoryPoints: getFieldNumber(fields, "Custom.EstimatedSP"),
    effort: getFieldNumber(fields, "Custom.Effort"),
    assignedTo: getIdentityDisplayName(fields["System.AssignedTo"]),
    assignedToUniqueName: getIdentityUniqueName(fields["System.AssignedTo"]),
    createdBy: getIdentityDisplayName(fields["System.CreatedBy"]),
    createdDate: getFieldString(fields, "System.CreatedDate"),
    changedBy: getIdentityDisplayName(fields["System.ChangedBy"]),
    changedDate: getFieldString(fields, "System.ChangedDate"),
    areaPath: getFieldString(fields, "System.AreaPath"),
    iterationPath: getFieldString(fields, "System.IterationPath"),
    description: getFieldString(fields, "System.Description"),
    acceptanceCriteria: getFieldString(
      fields,
      "Microsoft.VSTS.Common.AcceptanceCriteria",
    ),
    tags,
    relations: item.relations ?? [],
    webUrl: item._links?.html?.href ?? "",
  };
}

function assertProject(project?: string): string {
  if (!project) {
    throw createError({
      statusCode: 400,
      statusMessage: "Project is required. Pick an Azure DevOps project first.",
    });
  }

  return project;
}

function getRelationTargetId(
  relation: AzureWorkItemRelation,
): number | undefined {
  const match = relation.url?.match(/workItems\/(\d+)$/i);
  if (!match?.[1]) return undefined;

  const id = Number(match[1]);
  return Number.isFinite(id) ? id : undefined;
}

export function getRelationTargetIds(
  relations: AzureWorkItemRelation[] = [],
): number[] {
  return relations
    .map(getRelationTargetId)
    .filter((id): id is number => typeof id === "number");
}

export function groupWorkItemRelations(
  item: AzureWorkItem,
  relatedItems: AzureWorkItem[] = [],
): { children: AzureWorkItem[]; related: AzureWorkItem[] } {
  const itemById = new Map(
    relatedItems.map((relatedItem) => [relatedItem.id, relatedItem]),
  );
  const children: AzureWorkItem[] = [];
  const related: AzureWorkItem[] = [];

  for (const relation of item.relations ?? []) {
    const targetId = getRelationTargetId(relation);
    const targetItem = targetId ? itemById.get(targetId) : undefined;
    if (!targetItem) continue;

    if (relation.rel === "System.LinkTypes.Hierarchy-Forward") {
      children.push(targetItem);
    } else if (relation.rel === "System.LinkTypes.Related") {
      related.push(targetItem);
    }
  }

  return { children, related };
}

const WORK_ITEM_BATCH_SIZE = 200;

export function chunkWorkItemIds(
  ids: number[],
  size = WORK_ITEM_BATCH_SIZE,
): number[][] {
  const chunks: number[][] = [];

  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }

  return chunks;
}

const WORK_ITEM_FIELDS = [
  "System.Id",
  "System.Title",
  "System.State",
  "System.Reason",
  "System.WorkItemType",
  "System.AssignedTo",
  "System.CreatedBy",
  "System.CreatedDate",
  "System.ChangedBy",
  "System.ChangedDate",
  "System.AreaPath",
  "System.IterationPath",
  "System.Description",
  "System.Tags",
  "Microsoft.VSTS.Common.AcceptanceCriteria",
  "Microsoft.VSTS.Common.Priority",
  "Microsoft.VSTS.Common.Severity",
  "Custom.EstimatedSP",
  "Custom.Effort",
];

export function buildWorkItemBatchBody(
  ids: number[],
  options: { includeRelations?: boolean } = {},
): { ids: number[]; fields?: string[]; $expand: "Links" | "Relations" } {
  if (options.includeRelations) {
    return {
      ids,
      $expand: "Relations",
    };
  }

  return {
    ids,
    fields: WORK_ITEM_FIELDS,
    $expand: "Links",
  };
}

async function fetchWorkItemsByIds(
  project: string,
  ids: number[],
  options: { includeRelations?: boolean } = {},
): Promise<AzureWorkItem[]> {
  if (!ids.length) {
    return [];
  }

  const { organization } = getAzureConfig();
  const items: AzureWorkItem[] = [];

  for (const chunk of chunkWorkItemIds(ids)) {
    const batch = await azureFetch<{ value: AzureWorkItemResponse[] }>(
      getProjectUrl(
        organization,
        project,
        `wit/workitemsbatch?api-version=${API_VERSION}`,
      ),
      {
        method: "POST",
        body: buildWorkItemBatchBody(chunk, options),
      },
    );

    items.push(...getAzureCollectionItems(batch).map(normalizeWorkItem));
  }

  return items;
}

export async function getCurrentUser(): Promise<{
  displayName?: string;
  email?: string;
}> {
  const { organization } = getAzureConfig();
  const response = await azureFetch<AzureConnectionDataResponse>(
    getAzureDevOpsConnectionDataUrl(organization),
  );
  const user = response.authenticatedUser;

  return {
    displayName: user?.providerDisplayName,
    email: user?.properties?.Mail?.$value || user?.properties?.Account?.$value,
  };
}

export async function listOrganizations(): Promise<
  Array<{ id: string; name: string; slug: string; url?: string }>
> {
  const profile = await azureFetch<AzureProfileResponse>(
    "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1-preview.3",
  );
  const memberId = profile.id?.trim();

  if (!memberId) {
    return [];
  }

  const response = await azureFetch<AzureCollectionResponse<AzureAccountResponse>>(
    `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${encodeURIComponent(memberId)}&api-version=7.1-preview.1`,
  );

  const accounts = getAzureCollectionItems(response);
  const seen = new Set<string>();
  const organizations: Array<{
    id: string;
    name: string;
    slug: string;
    url?: string;
  }> = [];

  for (const account of accounts) {
    const slug = getOrganizationSlug(account);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    organizations.push({
      id: account.accountId || slug,
      name: account.accountName || account.organizationName || slug,
      slug,
      url: account.accountUri,
    });
  }

  organizations.sort((first, second) => first.name.localeCompare(second.name));

  return organizations;
}

export async function listProjects(): Promise<AzureProject[]> {
  const { organization } = getAzureConfig();
  const response = await azureFetch<AzureCollectionResponse<AzureProjectResponse>>(
    getOrganizationUrl(
      organization,
      `projects?api-version=${API_VERSION}&stateFilter=wellFormed`,
    ),
  );

  return getAzureCollectionItems(response).map(normalizeProject);
}

export async function listUsers(): Promise<AzureUser[]> {
  const { organization } = getAzureConfig();
  let response: AzureGraphUsersResponse;

  try {
    response = await azureFetch<AzureGraphUsersResponse>(
      getVisualStudioGraphUrl(
        organization,
        `users?api-version=${API_VERSION}-preview.1`,
      ),
    );
  } catch (error) {
    const statusCode = getHttpStatusCode(error);

    // Some orgs/scopes do not expose Graph users and return 404/403.
    // Keep the app functional by falling back to the signed-in identity.
    if (statusCode === 404 || statusCode === 403) {
      const currentUser = await getCurrentUser();
      return currentUser.displayName ?
          [
            {
              displayName: currentUser.displayName,
              uniqueName: currentUser.email,
              email: currentUser.email,
            },
          ]
        : [];
    }

    throw error;
  }

  const users = getGraphUsersFromResponse(response)
    .map(normalizeUser)
    .filter((user): user is AzureUser => Boolean(user))
    .sort((first, second) =>
      first.displayName.localeCompare(second.displayName),
    );

  return users;
}

export async function listProjectTeams(
  projectInput?: string,
): Promise<AzureTeam[]> {
  const project = assertProject(projectInput);
  const { organization } = getAzureConfig();
  const projects = await listProjects();
  const projectMatch = projects.find(
    (candidate) => candidate.name === project || candidate.id === project,
  );

  if (!projectMatch) {
    return [];
  }

  const response = await azureFetch<AzureCollectionResponse<AzureTeamResponse>>(
    buildProjectTeamsUrl(organization, projectMatch.id),
  );

  return getAzureCollectionItems(response).map((team) => ({
    id: team.id,
    name: team.name,
  }));
}

export async function listTeamSprints(
  projectInput?: string,
  teamInput?: string,
): Promise<AzureSprint[]> {
  const project = assertProject(projectInput);
  const team = String(teamInput || "").trim();
  const { organization } = getAzureConfig();

  if (!team) {
    return [];
  }

  const response = await azureFetch<AzureCollectionResponse<AzureTeamIterationResponse>>(
    `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations?api-version=${API_VERSION}`,
  );

  return getAzureCollectionItems(response).map((iteration) => ({
    id: iteration.id,
    name: iteration.name,
    path: iteration.path || iteration.name,
    startDate: iteration.attributes?.startDate,
    finishDate: iteration.attributes?.finishDate,
    timeFrame: iteration.attributes?.timeFrame,
  }));
}

export async function listSprintPbis(
  projectInput?: string,
  iterationPathInput?: string,
): Promise<AzureWorkItem[]> {
  const project = assertProject(projectInput);
  const iterationPath = String(iterationPathInput || "").trim();
  const { organization } = getAzureConfig();

  if (!iterationPath) {
    return [];
  }

  const escapedPath = escapeWiqlString(iterationPath);
  const wiql = await azureFetch<{ workItems: Array<{ id: number }> }>(
    getProjectUrl(organization, project, `wit/wiql?api-version=${API_VERSION}`),
    {
      method: "POST",
      body: {
        query: `
          SELECT [System.Id]
          FROM WorkItems
          WHERE [System.TeamProject] = @project
            AND [System.IterationPath] = '${escapedPath}'
            AND [System.WorkItemType] IN ('Product Backlog Item', 'User Story')
          ORDER BY [System.ChangedDate] DESC
        `,
      },
    },
  );

  const workItemRefs = getAzureCollectionItems(wiql);
  const items = await fetchWorkItemsByIds(
    project,
    workItemRefs.map((item) => item.id),
    { includeRelations: true },
  );
  const relationIds = Array.from(
    new Set(items.flatMap((item) => getRelationTargetIds(item.relations))),
  );
  const relatedItems = await fetchWorkItemsByIds(project, relationIds);

  return items.map((item) => ({
    ...item,
    relatedItems: relatedItems.filter((relatedItem) =>
      getRelationTargetIds(item.relations).includes(relatedItem.id),
    ),
  }));
}

function getCurrentUserCandidates(currentUser: {
  displayName?: string;
  email?: string;
}): string[] {
  return [currentUser.email, currentUser.displayName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function normalizeFilterValues(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((item) => String(item || "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

function expandFilterCandidates(
  values: string[],
  currentUserCandidates: string[],
): string[] {
  return values.flatMap((value) =>
    value === "me" ? currentUserCandidates : [value],
  );
}

function applyWorkItemFilters(
  items: AzureWorkItem[],
  filters: WorkItemListFilters,
  currentUserCandidates: string[],
): AzureWorkItem[] {
  let filteredItems = items;
  const assignedToValues = normalizeFilterValues(filters.assignedTo);
  const createdByValues = normalizeFilterValues(filters.createdBy);

  if (assignedToValues.length) {
    const candidates = expandFilterCandidates(
      assignedToValues,
      currentUserCandidates,
    );
    filteredItems = filteredItems.filter((item) =>
      isAssignedToCandidate(item, candidates),
    );
  }

  if (createdByValues.length) {
    const candidates = expandFilterCandidates(
      createdByValues,
      currentUserCandidates,
    );
    filteredItems = filteredItems.filter((item) =>
      isCreatedByCandidate(item, candidates),
    );
  }

  if (filters.keyword) {
    filteredItems = filteredItems.filter((item) =>
      workItemMatchesKeyword(item, filters.keyword || ""),
    );
  }

  return filteredItems;
}

export async function listRecentWorkItems(
  projectInput?: string,
  filters: WorkItemListFilters = {},
): Promise<WorkItemListResult> {
  const project = assertProject(projectInput);
  const { organization } = getAzureConfig();
  const currentUser = await getCurrentUser();
  const currentUserCandidates = getCurrentUserCandidates(currentUser);

  if (
    (normalizeFilterValues(filters.assignedTo).includes("me") ||
      normalizeFilterValues(filters.createdBy).includes("me")) &&
    !currentUserCandidates.length
  ) {
    throw createError({
      statusCode: 500,
      statusMessage:
        "Could not determine the current Azure DevOps user for me filtering.",
    });
  }

  const wiql = await azureFetch<{ workItems: Array<{ id: number }> }>(
    getProjectUrl(organization, project, `wit/wiql?api-version=${API_VERSION}`),
    {
      method: "POST",
      body: {
        query: buildWorkItemsWiql({ excludeRemoved: true }),
      },
    },
  );

  const needsLocalFilter = Boolean(
    filters.assignedTo || filters.createdBy || filters.keyword,
  );
  const fetchLimit =
    needsLocalFilter ? 500 : (
      Math.max((filters.offset || 0) + (filters.limit || 50), 50)
    );
  const workItemRefs = getAzureCollectionItems(wiql);
  const items = await fetchWorkItemsByIds(
    project,
    workItemRefs.slice(0, fetchLimit).map((item) => item.id),
  );
  const owner = await getSessionCacheOwnerFromEvent(
    azureEventStorage.getStore(),
  );

  if (owner) {
    await cacheWorkItemsForDashboard(owner, organization, project, items);
  }

  const filteredItems = applyWorkItemFilters(
    items,
    filters,
    currentUserCandidates,
  );

  return paginateWorkItems(filteredItems, filters);
}

export async function listAssignedToMeWorkItems(
  projectInput?: string,
  filters: Omit<WorkItemListFilters, "assignedTo"> = {},
): Promise<WorkItemListResult> {
  return await listRecentWorkItems(projectInput, {
    ...filters,
    assignedTo: "me",
  });
}

export async function getWorkItem(
  projectInput: string | undefined,
  id: number,
): Promise<AzureWorkItem> {
  const project = assertProject(projectInput);
  const items = await fetchWorkItemsByIds(project, [id]);

  if (!items[0]) {
    throw createError({
      statusCode: 404,
      statusMessage: `Work item #${id} not found.`,
    });
  }

  return items[0];
}

export async function createWorkItem(
  projectInput: string | undefined,
  input: AzureWorkItemInput,
): Promise<AzureWorkItem> {
  const project = assertProject(projectInput);
  const { organization } = getAzureConfig();
  const operations: JsonPatchOperation[] = [
    { op: "add", path: "/fields/System.Title", value: input.title },
  ];

  if (input.description) {
    operations.push({
      op: "add",
      path: "/fields/System.Description",
      value: input.description,
    });
  }

  if (input.assignedTo) {
    operations.push({
      op: "add",
      path: "/fields/System.AssignedTo",
      value: input.assignedTo,
    });
  }

  if (input.tags?.length) {
    operations.push({
      op: "add",
      path: "/fields/System.Tags",
      value: input.tags.join("; "),
    });
  }

  const created = await azureFetch<AzureWorkItemResponse>(
    getProjectUrl(
      organization,
      project,
      `wit/workitems/$${encodeURIComponent(input.type)}?api-version=${API_VERSION}`,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json-patch+json",
      },
      body: operations,
    },
  );

  return normalizeWorkItem(created);
}

export async function updateWorkItemState(
  projectInput: string | undefined,
  id: number,
  state: string,
): Promise<AzureWorkItem> {
  const project = assertProject(projectInput);
  const { organization } = getAzureConfig();
  const updated = await azureFetch<AzureWorkItemResponse>(
    getProjectUrl(
      organization,
      project,
      `wit/workitems/${id}?api-version=${API_VERSION}`,
    ),
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json-patch+json",
      },
      body: [
        { op: "add", path: "/fields/System.State", value: state },
      ] satisfies JsonPatchOperation[],
    },
  );

  return normalizeWorkItem(updated);
}
