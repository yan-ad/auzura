import { listRecentWorkItems } from '../../../utils/azure-devops'

export default defineEventHandler(async (): Promise<{ items: Awaited<ReturnType<typeof listRecentWorkItems>> }> => {
  const items = await listRecentWorkItems()

  return { items }
})
