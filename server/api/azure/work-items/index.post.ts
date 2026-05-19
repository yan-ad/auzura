import { z } from 'zod'
import { createWorkItem } from '../../../utils/azure-devops'

const schema = z.object({
  title: z.string().min(1),
  type: z.string().min(1).default('Task'),
  description: z.string().optional(),
  assignedTo: z.string().optional(),
  tags: z.array(z.string()).optional()
})

export default defineEventHandler(async (event): Promise<{ item: Awaited<ReturnType<typeof createWorkItem>> }> => {
  const body = await readValidatedBody(event, schema.parse)
  const item = await createWorkItem(body)

  return { item }
})
