import { getQuery } from 'h3'
import { listRecentWorkItems } from '../../../utils/azure-devops'

export default defineEventHandler(async (event): Promise<{ items: Awaited<ReturnType<typeof listRecentWorkItems>> }> => {
  const query = getQuery(event)
  const project = typeof query.project === 'string' ? query.project : undefined
  const items = await listRecentWorkItems(project)

  return { items }
})
