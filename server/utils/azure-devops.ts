import { createError } from 'h3'
import type { AzureWorkItem, AzureWorkItemInput } from '../../app/types/azure-devops'

const API_VERSION = '7.1'

type JsonPatchOperation = {
  op: 'add' | 'replace' | 'remove'
  path: string
  value?: unknown
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

export function getAzureConfig(): { organization: string, project: string, token: string } {
  const config = useRuntimeConfig()
  const organization = config.public.azureDevOpsOrganization
  const project = config.public.azureDevOpsProject
  const token = config.azureDevOpsToken

  if (!organization || !project || !token) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Azure DevOps is not configured. Set NUXT_PUBLIC_AZURE_DEVOPS_ORGANIZATION, NUXT_PUBLIC_AZURE_DEVOPS_PROJECT, and NUXT_AZURE_DEVOPS_TOKEN.'
    })
  }

  return { organization, project, token }
}

function getAuthHeader(token: string): string {
  return `Basic ${Buffer.from(`:${token}`).toString('base64')}`
}

function getProjectUrl(organization: string, project: string, path: string): string {
  const encodedProject = encodeURIComponent(project)
  return `https://dev.azure.com/${organization}/${encodedProject}/_apis/${path}`
}

async function azureFetch<T>(path: string, init: Parameters<typeof $fetch>[1] = {}): Promise<T> {
  const { organization, project, token } = getAzureConfig()

  const response = await $fetch<T>(getProjectUrl(organization, project, path), {
    ...init,
    headers: {
      Authorization: getAuthHeader(token),
      Accept: 'application/json',
      ...init.headers
    }
  })

  return response as T
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

export async function listRecentWorkItems(): Promise<AzureWorkItem[]> {
  const { project } = getAzureConfig()
  const wiql = await azureFetch<{ workItems: Array<{ id: number }> }>(`wit/wiql?api-version=${API_VERSION}`, {
    method: 'POST',
    body: {
      query: `
        SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [System.ChangedDate], [System.Tags]
        FROM WorkItems
        WHERE [System.TeamProject] = '${project.replaceAll("'", "''")}'
        ORDER BY [System.ChangedDate] DESC
      `
    }
  })

  const ids = wiql.workItems.slice(0, 25).map((item) => item.id)

  if (!ids.length) {
    return []
  }

  const batch = await azureFetch<{ value: AzureWorkItemResponse[] }>(`wit/workitemsbatch?api-version=${API_VERSION}`, {
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
  })

  return batch.value.map(normalizeWorkItem)
}

export async function createWorkItem(input: AzureWorkItemInput): Promise<AzureWorkItem> {
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

  const created = await azureFetch<AzureWorkItemResponse>(`wit/workitems/$${encodeURIComponent(input.type)}?api-version=${API_VERSION}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json-patch+json'
    },
    body: operations
  })

  return normalizeWorkItem(created)
}

export async function updateWorkItemState(id: number, state: string): Promise<AzureWorkItem> {
  const updated = await azureFetch<AzureWorkItemResponse>(`wit/workitems/${id}?api-version=${API_VERSION}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json-patch+json'
    },
    body: [
      { op: 'add', path: '/fields/System.State', value: state }
    ] satisfies JsonPatchOperation[]
  })

  return normalizeWorkItem(updated)
}
