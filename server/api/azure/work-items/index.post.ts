import { getQuery } from 'h3'
import { z } from 'zod'
import { createWorkItem, getAzureOrganizationFromQuery, withAzureOrganization } from '../../../utils/azure-devops'

const schema = z.object({
  title: z.string().min(1),
  type: z.string().min(1).default('Task'),
  description: z.string().optional(),
  assignedTo: z.string().optional(),
  tags: z.array(z.string()).optional()
})

export default defineEventHandler(async (event): Promise<{ item: Awaited<ReturnType<typeof createWorkItem>> }> => {
  const query = getQuery(event)
  const organization = getAzureOrganizationFromQuery(query)
  const project = typeof query.project === 'string' ? query.project : undefined
  const body = await readValidatedBody(event, schema.parse)
  const item = await withAzureOrganization(organization, () => createWorkItem(project, body))

  return { item }
})
