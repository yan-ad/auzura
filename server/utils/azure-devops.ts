import { AsyncLocalStorage } from 'node:async_hooks'
import { createError } from 'h3'
import type { AzureProject, AzureWorkItem, AzureWorkItemInput } from '../../app/types/azure-devops'

const API_VERSION = '7.1'
const azureOrganizationStorage = new AsyncLocalStorage<string>()

type AzureQuery = Record<string, unknown>

type JsonPatchOperation = {
  op: 'add' | 'replace' | 'remove'
  path: string
  value?: unknown
}

type AzureProjectResponse = {
  id: string
  name: string
  description?: string
  url?: string
  state?: string
  visibility?: string
}

type AzureWorkItemResponse = {
  id: number
  rev?: number
  url?: string
  fields?: Record<string, unknown>
  _links?: {
    html?: {
      href?: string
    }
  }
}

type AzureConnectionDataResponse = {
  authenticatedUser?: {
    providerDisplayName?: string
    properties?: {
      Account?: { $value?: string }
      Mail?: { $value?: string }
    }
  }
}

type FetchErrorWithData = Error & {
  status?: number
  statusCode?: number
  data?: {
    message?: string
    value?: { Message?: string }
    typeName?: string
  }
}

function escapeWiqlString(value: string): string {
  return value.replaceAll("'", "''")
}

export function buildWorkItemsWiql(options: { excludeRemoved?: boolean } = {}): string {
  const removedClause = options.excludeRemoved ? " AND [System.State] <> 'Removed'" : ''
  return `
          SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [System.ChangedDate], [System.Tags]
          FROM WorkItems
          WHERE [System.TeamProject] = @project${removedClause}
          ORDER BY [System.ChangedDate] DESC
        `
}

export function isAssignedToCandidate(item: Pick<AzureWorkItem, 'assignedTo' | 'assignedToUniqueName'>, candidates: string[]): boolean {
  const assignees = [item.assignedToUniqueName, item.assignedTo]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value))
  const normalizedCandidates = candidates.map((value) => value.trim().toLowerCase())

  return assignees.some((assignee) => normalizedCandidates.includes(assignee))
}

function getAzureErrorMessage(error: unknown): string {
  const fetchError = error as FetchErrorWithData
  return fetchError.data?.message
    || fetchError.data?.value?.Message
    || fetchError.message
    || 'Azure DevOps request failed.'
}

function getIdentityDisplayName(value: unknown): string | undefined {
  if (typeof value === 'object' && value) {
    const identity = value as { displayName?: string, uniqueName?: string }
    return identity.displayName || identity.uniqueName
  }

  return typeof value === 'string' ? value : undefined
}

function getIdentityUniqueName(value: unknown): string | undefined {
  if (typeof value === 'object' && value) {
    return (value as { uniqueName?: string }).uniqueName
  }

  return undefined
}

function getFieldString(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key]
  return value === undefined || value === null || value === '' ? undefined : String(value)
}

function getFieldNumber(fields: Record<string, unknown>, key: string): number | undefined {
  const value = fields[key]
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function getRuntimeConfig() {
  const runtimeGlobal = globalThis as typeof globalThis & { useRuntimeConfig?: () => { azureDevOpsOrganization?: unknown, azureDevOpsToken?: unknown, public?: { azureDevOpsOrganization?: unknown } } }
  return typeof runtimeGlobal.useRuntimeConfig === 'function'
    ? runtimeGlobal.useRuntimeConfig()
    : { public: {} }
}

function getConfiguredOrganization(): string {
  const config = getRuntimeConfig()
  return String(
    config.azureDevOpsOrganization
    || config.public?.azureDevOpsOrganization
    || process.env.NUXT_AZURE_DEVOPS_ORGANIZATION
    || process.env.NUXT_PUBLIC_AZURE_DEVOPS_ORGANIZATION
    || process.env.AZURE_DEVOPS_ORGANIZATION
    || ''
  ).trim()
}

function getAzureToken(): string {
  const config = getRuntimeConfig()
  return String(
    config.azureDevOpsToken
    || process.env.NUXT_AZURE_DEVOPS_TOKEN
    || process.env.AZURE_DEVOPS_TOKEN
    || ''
  ).trim()
}

export function getAzureOrganizationFromQuery(query: AzureQuery): string {
  const value = query.organization || query.org || azureOrganizationStorage.getStore() || getConfiguredOrganization()
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim()
}

export async function withAzureOrganization<T>(organization: string | undefined, callback: () => Promise<T>): Promise<T> {
  const normalized = organization?.trim()
  return normalized ? await azureOrganizationStorage.run(normalized, callback) : await callback()
}

export function getAzureConfig(): { organization: string, token: string } {
  const organization = azureOrganizationStorage.getStore() || getConfiguredOrganization()
  const token = getAzureToken()

  const missing = [
    !organization ? 'organization query parameter, NUXT_PUBLIC_AZURE_DEVOPS_ORGANIZATION, or AZURE_DEVOPS_ORGANIZATION' : '',
    !token ? 'NUXT_AZURE_DEVOPS_TOKEN or AZURE_DEVOPS_TOKEN' : ''
  ].filter(Boolean)

  if (missing.length) {
    throw createError({
      statusCode: 500,
      statusMessage: `Azure DevOps is not configured. Missing: ${missing.join(', ')}.`
    })
  }

  return { organization, token }
}

function getAuthHeader(token: string): string {
  return `Basic ${Buffer.from(`:${token}`).toString('base64')}`
}

function getOrganizationUrl(organization: string, path: string): string {
  return `https://dev.azure.com/${organization}/_apis/${path}`
}

function getProjectUrl(organization: string, project: string, path: string): string {
  const encodedProject = encodeURIComponent(project)
  return `https://dev.azure.com/${organization}/${encodedProject}/_apis/${path}`
}

async function azureFetch<T>(url: string, init: Parameters<typeof $fetch>[1] = {}): Promise<T> {
  const { token } = getAzureConfig()

  try {
    const response = await $fetch<T>(url, {
      ...init,
      headers: {
        Authorization: getAuthHeader(token),
        Accept: 'application/json',
        ...init.headers
      }
    })

    return response as T
  } catch (error) {
    const fetchError = error as FetchErrorWithData
    throw createError({
      statusCode: fetchError.statusCode || fetchError.status || 500,
      statusMessage: getAzureErrorMessage(error)
    })
  }
}

export function normalizeProject(project: AzureProjectResponse): AzureProject {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    url: project.url,
    state: project.state,
    visibility: project.visibility
  }
}

export function normalizeWorkItem(item: AzureWorkItemResponse): AzureWorkItem {
  const fields = item.fields ?? {}
  const tags = String(fields['System.Tags'] ?? '')
    .split(';')
    .map((tag) => tag.trim())
    .filter(Boolean)

  return {
    id: item.id,
    rev: item.rev,
    url: item.url,
    type: String(fields['System.WorkItemType'] ?? 'Work Item'),
    title: String(fields['System.Title'] ?? `Work item #${item.id}`),
    state: String(fields['System.State'] ?? 'Unknown'),
    reason: getFieldString(fields, 'System.Reason'),
    priority: getFieldNumber(fields, 'Microsoft.VSTS.Common.Priority'),
    severity: getFieldString(fields, 'Microsoft.VSTS.Common.Severity'),
    assignedTo: getIdentityDisplayName(fields['System.AssignedTo']),
    assignedToUniqueName: getIdentityUniqueName(fields['System.AssignedTo']),
    createdBy: getIdentityDisplayName(fields['System.CreatedBy']),
    createdDate: getFieldString(fields, 'System.CreatedDate'),
    changedBy: getIdentityDisplayName(fields['System.ChangedBy']),
    changedDate: getFieldString(fields, 'System.ChangedDate'),
    areaPath: getFieldString(fields, 'System.AreaPath'),
    iterationPath: getFieldString(fields, 'System.IterationPath'),
    description: getFieldString(fields, 'System.Description'),
    acceptanceCriteria: getFieldString(fields, 'Microsoft.VSTS.Common.AcceptanceCriteria'),
    tags,
    webUrl: item._links?.html?.href ?? ''
  }
}

function assertProject(project?: string): string {
  if (!project) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project is required. Pick an Azure DevOps project first.'
    })
  }

  return project
}

const WORK_ITEM_FIELDS = [
  'System.Id',
  'System.Title',
  'System.State',
  'System.Reason',
  'System.WorkItemType',
  'System.AssignedTo',
  'System.CreatedBy',
  'System.CreatedDate',
  'System.ChangedBy',
  'System.ChangedDate',
  'System.AreaPath',
  'System.IterationPath',
  'System.Description',
  'System.Tags',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
  'Microsoft.VSTS.Common.Priority',
  'Microsoft.VSTS.Common.Severity'
]

async function fetchWorkItemsByIds(project: string, ids: number[]): Promise<AzureWorkItem[]> {
  if (!ids.length) {
    return []
  }

  const { organization } = getAzureConfig()
  const batch = await azureFetch<{ value: AzureWorkItemResponse[] }>(
    getProjectUrl(organization, project, `wit/workitemsbatch?api-version=${API_VERSION}`),
    {
      method: 'POST',
      body: {
        ids,
        fields: WORK_ITEM_FIELDS,
        $expand: 'Links'
      }
    }
  )

  return batch.value.map(normalizeWorkItem)
}

export async function getCurrentUser(): Promise<{ displayName?: string, email?: string }> {
  const { organization } = getAzureConfig()
  const response = await azureFetch<AzureConnectionDataResponse>(
    getOrganizationUrl(organization, `connectionData?api-version=${API_VERSION}`)
  )
  const user = response.authenticatedUser

  return {
    displayName: user?.providerDisplayName,
    email: user?.properties?.Mail?.$value || user?.properties?.Account?.$value
  }
}


export async function listProjects(): Promise<AzureProject[]> {
  const { organization } = getAzureConfig()
  const response = await azureFetch<{ value: AzureProjectResponse[] }>(
    getOrganizationUrl(organization, `projects?api-version=${API_VERSION}&stateFilter=wellFormed`)
  )

  return response.value.map(normalizeProject)
}

export async function listRecentWorkItems(projectInput?: string): Promise<AzureWorkItem[]> {
  const project = assertProject(projectInput)
  const { organization } = getAzureConfig()
  const wiql = await azureFetch<{ workItems: Array<{ id: number }> }>(
    getProjectUrl(organization, project, `wit/wiql?api-version=${API_VERSION}`),
    {
      method: 'POST',
      body: {
        query: buildWorkItemsWiql()
      }
    }
  )

  return await fetchWorkItemsByIds(project, wiql.workItems.slice(0, 25).map((item) => item.id))
}

export async function listAssignedToMeWorkItems(projectInput?: string): Promise<AzureWorkItem[]> {
  const project = assertProject(projectInput)
  const { organization } = getAzureConfig()
  const currentUser = await getCurrentUser()
  const candidates = [currentUser.email, currentUser.displayName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))

  if (!candidates.length) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not determine the current Azure DevOps user for assigned-to-me filtering.'
    })
  }

  const wiql = await azureFetch<{ workItems: Array<{ id: number }> }>(
    getProjectUrl(organization, project, `wit/wiql?api-version=${API_VERSION}`),
    {
      method: 'POST',
      body: { query: buildWorkItemsWiql({ excludeRemoved: true }) }
    }
  )

  const items = await fetchWorkItemsByIds(project, wiql.workItems.slice(0, 500).map((item) => item.id))
  return items.filter((item) => isAssignedToCandidate(item, candidates)).slice(0, 100)
}

export async function getWorkItem(projectInput: string | undefined, id: number): Promise<AzureWorkItem> {
  const project = assertProject(projectInput)
  const items = await fetchWorkItemsByIds(project, [id])

  if (!items[0]) {
    throw createError({ statusCode: 404, statusMessage: `Work item #${id} not found.` })
  }

  return items[0]
}

export async function createWorkItem(projectInput: string | undefined, input: AzureWorkItemInput): Promise<AzureWorkItem> {
  const project = assertProject(projectInput)
  const { organization } = getAzureConfig()
  const operations: JsonPatchOperation[] = [
    { op: 'add', path: '/fields/System.Title', value: input.title }
  ]

  if (input.description) {
    operations.push({ op: 'add', path: '/fields/System.Description', value: input.description })
  }

  if (input.assignedTo) {
    operations.push({ op: 'add', path: '/fields/System.AssignedTo', value: input.assignedTo })
  }

  if (input.tags?.length) {
    operations.push({ op: 'add', path: '/fields/System.Tags', value: input.tags.join('; ') })
  }

  const created = await azureFetch<AzureWorkItemResponse>(
    getProjectUrl(organization, project, `wit/workitems/$${encodeURIComponent(input.type)}?api-version=${API_VERSION}`),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json-patch+json'
      },
      body: operations
    }
  )

  return normalizeWorkItem(created)
}

export async function updateWorkItemState(projectInput: string | undefined, id: number, state: string): Promise<AzureWorkItem> {
  const project = assertProject(projectInput)
  const { organization } = getAzureConfig()
  const updated = await azureFetch<AzureWorkItemResponse>(
    getProjectUrl(organization, project, `wit/workitems/${id}?api-version=${API_VERSION}`),
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json-patch+json'
      },
      body: [
        { op: 'add', path: '/fields/System.State', value: state }
      ] satisfies JsonPatchOperation[]
    }
  )

  return normalizeWorkItem(updated)
}
