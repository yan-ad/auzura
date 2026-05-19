import { z } from 'zod'
import { updateWorkItemState } from '../../../../utils/azure-devops'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })
const bodySchema = z.object({ state: z.string().min(1) })

export default defineEventHandler(async (event): Promise<{ item: Awaited<ReturnType<typeof updateWorkItemState>> }> => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { state } = await readValidatedBody(event, bodySchema.parse)
  const item = await updateWorkItemState(id, state)

  return { item }
})
