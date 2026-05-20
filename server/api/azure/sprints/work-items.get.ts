import { getQuery } from 'h3'
import { getAzureOrganizationFromQuery, listSprintPbis, withAzureOrganization } from '../../../utils/azure-devops'

export default defineEventHandler(async (event): Promise<{ items: Awaited<ReturnType<typeof listSprintPbis>> }> => {
  const query = getQuery(event)
  const organization = getAzureOrganizationFromQuery(query)
  const project = String(query.project || '').trim()
  const iterationPath = String(query.iterationPath || '').trim()
  const items = await withAzureOrganization(organization, () => listSprintPbis(project, iterationPath), event)

  return { items }
})
