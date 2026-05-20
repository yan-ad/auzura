import { getQuery } from 'h3'
import { getAzureOrganizationFromQuery, withAzureOrganization } from '../../../utils/azure-devops'
import { getDashboardMetrics, type DashboardMetrics } from '../../../utils/dashboard-metrics'

function getStringQueryValue(value: unknown): string | undefined {
  const normalized = Array.isArray(value) ? value[0] : value
  return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

export default defineEventHandler(async (event): Promise<{ metrics: DashboardMetrics }> => {
  const query = getQuery(event)
  const organization = getAzureOrganizationFromQuery(query)
  const project = getStringQueryValue(query.project)

  return await withAzureOrganization(organization, async () => ({
    metrics: await getDashboardMetrics(organization, project || '')
  }), event)
})
