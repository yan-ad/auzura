export type AzureWorkItemState = 'New' | 'Active' | 'Resolved' | 'Closed' | 'Removed' | string

export interface AzureWorkItem {
  id: number
  rev?: number
  url?: string
  type: string
  title: string
  state: AzureWorkItemState
  assignedTo?: string
  changedDate?: string
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
