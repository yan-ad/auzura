import { getQuery } from 'h3'
import { z } from 'zod'
import { getWorkItem } from '../../../../utils/azure-devops'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

export default defineEventHandler(async (event): Promise<{ item: Awaited<ReturnType<typeof getWorkItem>> }> => {
  const query = getQuery(event)
  const project = typeof query.project === 'string' ? query.project : undefined
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const item = await getWorkItem(project, id)

  return { item }
})
