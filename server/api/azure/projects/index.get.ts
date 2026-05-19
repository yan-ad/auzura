import { getQuery } from 'h3'
import { getAzureOrganizationFromQuery, listProjects, withAzureOrganization } from '../../../utils/azure-devops'

export default defineEventHandler(async (event): Promise<{ projects: Awaited<ReturnType<typeof listProjects>> }> => {
  const organization = getAzureOrganizationFromQuery(getQuery(event))
  const projects = await withAzureOrganization(organization, () => listProjects())

  return { projects }
})
