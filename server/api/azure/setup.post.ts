import { createError, readBody } from 'h3'
import { listProjects, withAzureOrganization } from '../../utils/azure-devops'
import { getSessionUserKey, setCachedProjects } from '../../utils/project-cache'

export default defineEventHandler(async (event): Promise<{ organization: string, projects: Awaited<ReturnType<typeof listProjects>> }> => {
  const session = await getUserSession(event)
  const userKey = getSessionUserKey(session.user)

  if (!userKey) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sign in required before setup.'
    })
  }

  const body = await readBody<{ organization?: string }>(event)
  const organization = String(body?.organization || '').trim()

  if (!organization) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Organization is required.'
    })
  }

  const projects = await withAzureOrganization(organization, () => listProjects(), event)
  await setCachedProjects(userKey, organization, projects)

  return { organization, projects }
})
