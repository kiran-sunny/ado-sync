/**
 * Azure DevOps REST API Types
 */

/**
 * ADO Work Item response from API
 */
export interface AdoWorkItemResponse {
  id: number;
  rev: number;
  url: string;
  fields: AdoWorkItemFields;
  relations?: AdoRelation[];
  _links?: AdoLinks;
}

/**
 * ADO Work Item fields
 */
export interface AdoWorkItemFields {
  'System.Id': number;
  'System.Rev': number;
  'System.Title': string;
  'System.Description'?: string;
  'System.State': string;
  'System.WorkItemType': string;
  'System.AssignedTo'?: AdoIdentityRef;
  'System.AreaPath': string;
  'System.IterationPath': string;
  'System.CreatedDate': string;
  'System.ChangedDate': string;
  'System.CreatedBy': AdoIdentityRef;
  'System.ChangedBy': AdoIdentityRef;
  'System.Tags'?: string;

  // Priority and value
  'Microsoft.VSTS.Common.Priority'?: number;
  'Microsoft.VSTS.Common.ValueArea'?: string;
  'Microsoft.VSTS.Common.BusinessValue'?: number;

  // Scheduling
  'Microsoft.VSTS.Scheduling.Effort'?: number;
  'Microsoft.VSTS.Scheduling.StoryPoints'?: number;
  'Microsoft.VSTS.Scheduling.RemainingWork'?: number;
  'Microsoft.VSTS.Scheduling.OriginalEstimate'?: number;
  'Microsoft.VSTS.Scheduling.CompletedWork'?: number;
  'Microsoft.VSTS.Scheduling.TargetDate'?: string;

  // Task specific
  'Microsoft.VSTS.Common.Activity'?: string;

  // Acceptance criteria
  'Microsoft.VSTS.Common.AcceptanceCriteria'?: string;

  // Allow additional fields
  [key: string]: unknown;
}

/**
 * ADO Identity reference
 */
export interface AdoIdentityRef {
  displayName: string;
  url: string;
  _links: AdoLinks;
  id: string;
  uniqueName: string;
  imageUrl?: string;
  descriptor?: string;
}

/**
 * ADO Relation (links between work items)
 */
export interface AdoRelation {
  rel: string;
  url: string;
  attributes?: {
    isLocked?: boolean;
    name?: string;
    comment?: string;
  };
}

/**
 * ADO Links
 */
export interface AdoLinks {
  self?: { href: string };
  workItemUpdates?: { href: string };
  workItemRevisions?: { href: string };
  workItemComments?: { href: string };
  html?: { href: string };
  workItemType?: { href: string };
  fields?: { href: string };
  [key: string]: { href: string } | undefined;
}

/**
 * JSON Patch operation for work item updates
 */
export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'test' | 'move' | 'copy';
  path: string;
  value?: unknown;
  from?: string;
}

/**
 * Batch request for getting multiple work items
 */
export interface BatchWorkItemsRequest {
  ids: number[];
  $expand?: 'None' | 'Relations' | 'Fields' | 'Links' | 'All';
  fields?: string[];
  asOf?: string;
  errorPolicy?: 'Fail' | 'Omit';
}

/**
 * Batch response
 */
export interface BatchWorkItemsResponse {
  count: number;
  value: AdoWorkItemResponse[];
}

/**
 * Work Item Comment
 */
export interface AdoCommentResponse {
  id: number;
  workItemId: number;
  version: number;
  text: string;
  createdBy: AdoIdentityRef;
  createdDate: string;
  modifiedBy?: AdoIdentityRef;
  modifiedDate?: string;
  url: string;
}

/**
 * Comments list response
 */
export interface AdoCommentsResponse {
  totalCount: number;
  count: number;
  comments: AdoCommentResponse[];
}

/**
 * Pull Request response
 */
export interface AdoPullRequestResponse {
  pullRequestId: number;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'abandoned' | 'notSet';
  createdBy: AdoIdentityRef;
  creationDate: string;
  closedDate?: string;
  sourceRefName: string;
  targetRefName: string;
  mergeStatus?: string;
  url: string;
  repository: {
    id: string;
    name: string;
    url: string;
  };
}

/**
 * Pull Requests list response
 */
export interface AdoPullRequestsResponse {
  count: number;
  value: AdoPullRequestResponse[];
}

/**
 * Work Item Update (history)
 */
export interface AdoWorkItemUpdate {
  id: number;
  workItemId: number;
  rev: number;
  revisedBy: AdoIdentityRef;
  revisedDate: string;
  fields?: {
    [fieldName: string]: {
      oldValue?: unknown;
      newValue?: unknown;
    };
  };
  relations?: {
    added?: AdoRelation[];
    removed?: AdoRelation[];
    updated?: AdoRelation[];
  };
  url: string;
}

/**
 * Work Item Updates response
 */
export interface AdoWorkItemUpdatesResponse {
  count: number;
  value: AdoWorkItemUpdate[];
}

/**
 * API Error response
 */
export interface AdoApiError {
  $id: string;
  innerException?: AdoApiError;
  message: string;
  typeName: string;
  typeKey: string;
  errorCode: number;
  eventId: number;
}

/**
 * Field mapping from YAML to ADO
 */
export const FIELD_MAP: Record<string, string> = {
  title: 'System.Title',
  description: 'System.Description',
  state: 'System.State',
  assignedTo: 'System.AssignedTo',
  areaPath: 'System.AreaPath',
  iterationPath: 'System.IterationPath',
  priority: 'Microsoft.VSTS.Common.Priority',
  effort: 'Microsoft.VSTS.Scheduling.Effort',
  storyPoints: 'Microsoft.VSTS.Scheduling.StoryPoints',
  businessValue: 'Microsoft.VSTS.Common.BusinessValue',
  acceptanceCriteria: 'Microsoft.VSTS.Common.AcceptanceCriteria',
  valueArea: 'Microsoft.VSTS.Common.ValueArea',
  targetDate: 'Microsoft.VSTS.Scheduling.TargetDate',
  remainingWork: 'Microsoft.VSTS.Scheduling.RemainingWork',
  originalEstimate: 'Microsoft.VSTS.Scheduling.OriginalEstimate',
  completedWork: 'Microsoft.VSTS.Scheduling.CompletedWork',
  activity: 'Microsoft.VSTS.Common.Activity',
  tags: 'System.Tags',
} as const;

/**
 * Reverse field mapping from ADO to YAML
 */
export const REVERSE_FIELD_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([k, v]) => [v, k])
);

/**
 * Link types for parent-child relationships
 */
export const LINK_TYPES = {
  PARENT: 'System.LinkTypes.Hierarchy-Reverse',
  CHILD: 'System.LinkTypes.Hierarchy-Forward',
  RELATED: 'System.LinkTypes.Related',
} as const;
