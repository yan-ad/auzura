import { getQuery } from 'h3'
import { getAzureOrganizationFromQuery, listAssignedToMeWorkItems, type WorkItemListFilters, withAzureOrganization } from '../../../utils/azure-devops'

function getStringQueryValue(value: unknown): string | undefined {
  const normalized = Array.isArray(value) ? value[0] : value
  return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

function getNumberQueryValue(value: unknown): number | undefined {
  const normalized = Array.isArray(value) ? value[0] : value
  const number = Number(normalized)
  return Number.isFinite(number) ? number : undefined
}

export default defineEventHandler(async (event): Promise<Awaited<ReturnType<typeof listAssignedToMeWorkItems>>> => {
  const query = getQuery(event)
  const organization = getAzureOrganizationFromQuery(query)
  const project = getStringQueryValue(query.project)
  const filters: Omit<WorkItemListFilters, 'assignedTo'> = {
    createdBy: getStringQueryValue(query.createdBy),
    keyword: getStringQueryValue(query.keyword),
    offset: getNumberQueryValue(query.offset),
    limit: getNumberQueryValue(query.limit)
  }
  return await withAzureOrganization(organization, () => listAssignedToMeWorkItems(project, filters), event)
})
