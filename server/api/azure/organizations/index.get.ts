import { listOrganizations } from '../../../utils/azure-devops'

export default defineEventHandler(async (): Promise<{ organizations: Awaited<ReturnType<typeof listOrganizations>> }> => {
  const organizations = await listOrganizations()
  return { organizations }
})
