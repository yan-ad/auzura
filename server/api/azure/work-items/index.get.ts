import { getQuery } from 'h3'
import { getAzureOrganizationFromQuery, listRecentWorkItems, withAzureOrganization } from '../../../utils/azure-devops'

export default defineEventHandler(async (event): Promise<{ items: Awaited<ReturnType<typeof listRecentWorkItems>> }> => {
  const query = getQuery(event)
  const organization = getAzureOrganizationFromQuery(query)
  const project = typeof query.project === 'string' ? query.project : undefined
  const items = await withAzureOrganization(organization, () => listRecentWorkItems(project))

  return { items }
})
