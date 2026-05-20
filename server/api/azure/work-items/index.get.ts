import { getQuery } from 'h3'
import { getAzureOrganizationFromQuery, listRecentWorkItems, listSprintPbis, type WorkItemListFilters, type WorkItemListResult, withAzureOrganization } from '../../../utils/azure-devops'

function normalizeQueryString(value: string): string {
  let normalized = value.trim()

  for (let index = 0; index < 25; index += 1) {
    try {
      const decoded = decodeURIComponent(normalized)
      if (decoded === normalized) break
      normalized = decoded
    } catch {
      break
    }
  }

  return normalized
}

function getStringQueryValue(value: unknown): string | undefined {
  const normalized = Array.isArray(value) ? value[0] : value
  if (typeof normalized !== 'string') return undefined
  const queryValue = normalizeQueryString(normalized)
  return queryValue ? queryValue : undefined
}

function getStringArrayQueryValue(value: unknown): string[] | undefined {
  const values = Array.isArray(value) ? value : [value]
  const normalized = values
    .flatMap((item) => String(item || '').split(','))
    .map((item) => item.trim())
    .filter(Boolean)

  return normalized.length ? normalized : undefined
}

function getNumberQueryValue(value: unknown): number | undefined {
  const normalized = Array.isArray(value) ? value[0] : value
  const number = Number(normalized)
  return Number.isFinite(number) ? number : undefined
}

export default defineEventHandler(async (event): Promise<WorkItemListResult> => {
  const query = getQuery(event)
  const organization = getAzureOrganizationFromQuery(query)
  const project = getStringQueryValue(query.project)
  const iterationPath = getStringQueryValue(query.iterationPath)
  const filters: WorkItemListFilters = {
    assignedTo: getStringArrayQueryValue(query.assignedTo),
    createdBy: getStringArrayQueryValue(query.createdBy),
    keyword: getStringQueryValue(query.keyword),
    offset: getNumberQueryValue(query.offset),
    limit: getNumberQueryValue(query.limit)
  }

  return await withAzureOrganization(organization, async () => {
    if (iterationPath) {
      const items = await listSprintPbis(project, iterationPath)
      return {
        items,
        total: items.length,
        offset: 0,
        limit: items.length
      }
    }

    return await listRecentWorkItems(project, filters)
  }, event)
})
