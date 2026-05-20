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
    .map((item) => normalizeQueryString(item))
    .filter(Boolean)

  return normalized.length ? normalized : undefined
}

function filterSprintItems(
  items: Awaited<ReturnType<typeof listSprintPbis>>,
  filters: WorkItemListFilters
): Awaited<ReturnType<typeof listSprintPbis>> {
  const keyword = filters.keyword?.trim().replace(/^#/, '').toLowerCase()
  const assignedTo = (Array.isArray(filters.assignedTo) ? filters.assignedTo : filters.assignedTo ? [filters.assignedTo] : [])
    .map((value: string) => value.toLowerCase())
  const createdBy = (Array.isArray(filters.createdBy) ? filters.createdBy : filters.createdBy ? [filters.createdBy] : [])
    .map((value: string) => value.toLowerCase())

  return items.filter((item) => {
    const searchable = [
      item.id,
      item.title,
      item.type,
      item.state,
      item.assignedTo,
      item.createdBy,
      item.areaPath,
      item.iterationPath,
      ...(item.tags ?? [])
    ]
      .filter((value) => value !== undefined && value !== null)
      .join(' ')
      .toLowerCase()

    const matchesKeyword = !keyword || searchable.includes(keyword)
    const matchesAssigned = !assignedTo.length || assignedTo.some((value: string) => searchable.includes(value))
    const matchesCreated = !createdBy.length || createdBy.some((value: string) => String(item.createdBy || '').toLowerCase().includes(value))

    return matchesKeyword && matchesAssigned && matchesCreated
  })
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
      const items = filterSprintItems(await listSprintPbis(project, iterationPath), filters)
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
