export type AzureWorkItemState = 'New' | 'Active' | 'Resolved' | 'Closed' | 'Removed' | string

export interface AzureIdentity {
  displayName?: string
  uniqueName?: string
  imageUrl?: string
  descriptor?: string
}

export interface AzureWorkItem {
  id: number
  rev?: number
  url?: string
  type: string
  title: string
  state: AzureWorkItemState
  reason?: string
  priority?: number
  severity?: string
  assignedTo?: string
  assignedToUniqueName?: string
  createdBy?: string
  createdDate?: string
  changedBy?: string
  changedDate?: string
  areaPath?: string
  iterationPath?: string
  description?: string
  acceptanceCriteria?: string
  tags: string[]
  webUrl: string
}

export interface AzureWorkItemInput {
  title: string
  type: string
  description?: string
  assignedTo?: string
  tags?: string[]
}

export interface AzureProject {
  id: string
  name: string
  description?: string
  url?: string
  state?: string
  visibility?: string
}
