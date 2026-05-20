import { getQuery } from 'h3'
import { getAzureOrganizationFromQuery, listOrganizations, withAzureOrganization } from '../../../utils/azure-devops'

export default defineEventHandler(async (event): Promise<{ organizations: Awaited<ReturnType<typeof listOrganizations>> }> => {
  const query = getQuery(event)
  const organization = getAzureOrganizationFromQuery(query)
  const organizations = await withAzureOrganization(organization, () => listOrganizations(), event)
  return { organizations }
})
