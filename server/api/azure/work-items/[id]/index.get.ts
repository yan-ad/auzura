import { getQuery } from 'h3'
import { z } from 'zod'
import { getAzureOrganizationFromQuery, getWorkItem, withAzureOrganization } from '../../../../utils/azure-devops'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

export default defineEventHandler(async (event): Promise<{ item: Awaited<ReturnType<typeof getWorkItem>> }> => {
  const query = getQuery(event)
  const organization = getAzureOrganizationFromQuery(query)
  const project = typeof query.project === 'string' ? query.project : undefined
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const item = await withAzureOrganization(organization, () => getWorkItem(project, id), event)

  return { item }
})
