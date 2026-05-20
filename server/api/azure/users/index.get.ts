import { getQuery } from 'h3'
import { getAzureOrganizationFromQuery, listUsers, withAzureOrganization } from '../../../utils/azure-devops'

export default defineEventHandler(async (event): Promise<{ users: Awaited<ReturnType<typeof listUsers>> }> => {
  const query = getQuery(event)
  const organization = getAzureOrganizationFromQuery(query)
  const users = await withAzureOrganization(organization, () => listUsers(), event)

  return { users }
})
