import { getQuery } from 'h3'
import { getAzureOrganizationFromQuery, listProjects, withAzureOrganization } from '../../../utils/azure-devops'
import { getCachedProjects, getSessionUserKey, setCachedProjects } from '../../../utils/project-cache'

export default defineEventHandler(async (event): Promise<{ projects: Awaited<ReturnType<typeof listProjects>> }> => {
  const query = getQuery(event)
  const organization = getAzureOrganizationFromQuery(query)
  const refresh = String(query.refresh || '').trim() === '1'
  const session = await getUserSession(event)
  const userKey = getSessionUserKey(session.user)

  if (!refresh && userKey) {
    const cachedProjects = await getCachedProjects(userKey, organization)
    if (cachedProjects.length) {
      return { projects: cachedProjects }
    }
  }

  const projects = await withAzureOrganization(organization, () => listProjects(), event)

  if (userKey && organization) {
    await setCachedProjects(userKey, organization, projects)
  }

  return { projects }
})
