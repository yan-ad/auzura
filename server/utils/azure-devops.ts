import { createError } from 'h3'
import type { AzureProject, AzureWorkItem, AzureWorkItemInput } from '../../app/types/azure-devops'

const API_VERSION = '7.1'

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

export function getAzureConfig(): { organization: string, token: string } {
  const config = useRuntimeConfig()
  const organization = String(
    config.azureDevOpsOrganization
    || config.public.azureDevOpsOrganization
    || process.env.NUXT_AZURE_DEVOPS_ORGANIZATION
    || process.env.NUXT_PUBLIC_AZURE_DEVOPS_ORGANIZATION
    || process.env.AZURE_DEVOPS_ORGANIZATION
    || ''
  ).trim()
  const token = String(
    config.azureDevOpsToken
    || process.env.NUXT_AZURE_DEVOPS_TOKEN
    || process.env.AZURE_DEVOPS_TOKEN
    || ''
  ).trim()

  const missing = [
    !organization ? 'NUXT_PUBLIC_AZURE_DEVOPS_ORGANIZATION or AZURE_DEVOPS_ORGANIZATION' : '',
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
  const response = await $fetch<T>(url, {
    ...init,
    headers: {
      Authorization: getAuthHeader(token),
      Accept: 'application/json',
      ...init.headers
    }
  })

  return response as T
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
    assignedTo: typeof fields['System.AssignedTo'] === 'object' && fields['System.AssignedTo']
      ? String((fields['System.AssignedTo'] as { displayName?: string }).displayName ?? '')
      : undefined,
    changedDate: fields['System.ChangedDate'] ? String(fields['System.ChangedDate']) : undefined,
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
        query: `
          SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [System.ChangedDate], [System.Tags]
          FROM WorkItems
          WHERE [System.TeamProject] = '${project.replaceAll("'", "''")}'
          ORDER BY [System.ChangedDate] DESC
        `
      }
    }
  )

  const ids = wiql.workItems.slice(0, 25).map((item) => item.id)

  if (!ids.length) {
    return []
  }

  const batch = await azureFetch<{ value: AzureWorkItemResponse[] }>(
    getProjectUrl(organization, project, `wit/workitemsbatch?api-version=${API_VERSION}`),
    {
      method: 'POST',
      body: {
        ids,
        fields: [
          'System.Id',
          'System.Title',
          'System.State',
          'System.WorkItemType',
          'System.AssignedTo',
          'System.ChangedDate',
          'System.Tags'
        ],
        $expand: 'Links'
      }
    }
  )

  return batch.value.map(normalizeWorkItem)
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
