import { listProjects } from '../../../utils/azure-devops'

export default defineEventHandler(async (): Promise<{ projects: Awaited<ReturnType<typeof listProjects>> }> => {
  const projects = await listProjects()

  return { projects }
})
