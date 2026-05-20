import { getQuery } from 'h3'
import { getAzureOrganizationFromQuery, listProjectTeams, withAzureOrganization } from '../../../utils/azure-devops'

export default defineEventHandler(async (event): Promise<{ teams: Awaited<ReturnType<typeof listProjectTeams>> }> => {
  const query = getQuery(event)
  const organization = getAzureOrganizationFromQuery(query)
  const project = String(query.project || '').trim()
  const teams = await withAzureOrganization(organization, () => listProjectTeams(project), event)

  return { teams }
})
