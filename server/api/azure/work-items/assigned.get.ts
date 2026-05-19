import { getQuery } from 'h3'
import { listAssignedToMeWorkItems } from '../../../utils/azure-devops'

export default defineEventHandler(async (event): Promise<{ items: Awaited<ReturnType<typeof listAssignedToMeWorkItems>> }> => {
  const query = getQuery(event)
  const project = typeof query.project === 'string' ? query.project : undefined
  const items = await listAssignedToMeWorkItems(project)

  return { items }
})
