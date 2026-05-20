import { getQuery } from 'h3'
import { getAzureOrganizationFromQuery, listTeamSprints, withAzureOrganization } from '../../../utils/azure-devops'

export default defineEventHandler(async (event): Promise<{ sprints: Awaited<ReturnType<typeof listTeamSprints>> }> => {
  const query = getQuery(event)
  const organization = getAzureOrganizationFromQuery(query)
  const project = String(query.project || '').trim()
  const team = String(query.team || '').trim()
  const sprints = await withAzureOrganization(organization, () => listTeamSprints(project, team), event)

  return { sprints }
})
