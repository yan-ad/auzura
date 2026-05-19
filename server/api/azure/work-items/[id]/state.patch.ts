import { getQuery } from 'h3'
import { z } from 'zod'
import { getAzureOrganizationFromQuery, updateWorkItemState, withAzureOrganization } from '../../../../utils/azure-devops'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })
const bodySchema = z.object({ state: z.string().min(1) })

export default defineEventHandler(async (event): Promise<{ item: Awaited<ReturnType<typeof updateWorkItemState>> }> => {
  const query = getQuery(event)
  const organization = getAzureOrganizationFromQuery(query)
  const project = typeof query.project === 'string' ? query.project : undefined
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { state } = await readValidatedBody(event, bodySchema.parse)
  const item = await withAzureOrganization(organization, () => updateWorkItemState(project, id, state))

  return { item }
})
