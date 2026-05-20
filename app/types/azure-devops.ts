export type AzureWorkItemState =
  | "New"
  | "Active"
  | "Resolved"
  | "Closed"
  | "Removed"
  | string;

export interface AzureIdentity {
  displayName?: string;
  uniqueName?: string;
  imageUrl?: string;
  descriptor?: string;
}

export interface AzureWorkItemRelation {
  rel?: string;
  url?: string;
  attributes?: Record<string, unknown>;
}

export interface AzureWorkItem {
  id: number;
  rev?: number;
  url?: string;
  type: string;
  title: string;
  state: AzureWorkItemState;
  reason?: string;
  priority?: number;
  severity?: string;
  assignedTo?: string;
  assignedToUniqueName?: string;
  createdBy?: string;
  createdDate?: string;
  changedBy?: string;
  changedDate?: string;
  areaPath?: string;
  iterationPath?: string;
  description?: string;
  acceptanceCriteria?: string;
  tags: string[];
  relations?: AzureWorkItemRelation[];
  relatedItems?: AzureWorkItem[];
  webUrl: string;
}

export interface AzureWorkItemInput {
  title: string;
  type: string;
  description?: string;
  assignedTo?: string;
  tags?: string[];
}

export interface AzureProject {
  id: string;
  name: string;
  description?: string;
  url?: string;
  state?: string;
  visibility?: string;
}

export interface AzureOrganization {
  id: string;
  name: string;
  slug: string;
  url?: string;
  isDefault?: boolean;
}

export interface AzureUser {
  displayName: string;
  uniqueName?: string;
  email?: string;
  descriptor?: string;
  imageUrl?: string;
}

export interface AzureTeam {
  id: string;
  name: string;
}

export interface AzureSprint {
  id: string;
  name: string;
  path: string;
  startDate?: string;
  finishDate?: string;
  timeFrame?: string;
}
