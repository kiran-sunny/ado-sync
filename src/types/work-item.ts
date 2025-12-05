/**
 * Work Item Types and Interfaces
 */

export type HierarchyType = 'full' | 'medium' | 'simple';

export type WorkItemType = 'Epic' | 'Feature' | 'Product Backlog Item' | 'User Story' | 'Task' | 'Bug' | 'Issue';

export type WorkItemState = 'New' | 'Active' | 'Resolved' | 'Closed' | 'Removed' |
  'Approved' | 'Committed' | 'Done' | 'In Progress' | 'To Do';

export type ConflictStrategy = 'ado-wins' | 'yaml-wins' | 'manual';

export type SyncAction = 'create' | 'update' | 'skip' | 'conflict' | 'delete';

/**
 * ADO metadata stored in YAML after sync
 */
export interface AdoMetadata {
  workItemId: number | null;
  url: string | null;
  rev: number | null;
  lastSyncedAt: string | null;
  etag?: string | null;
  // Read-only data pulled from ADO
  state?: string;
  assignedTo?: string;
  comments?: AdoComment[];
  linkedPRs?: AdoPullRequest[];
  history?: AdoHistoryEntry[];
}

export interface AdoComment {
  id: number;
  author: string;
  date: string;
  text: string;
}

export interface AdoPullRequest {
  id: number;
  title: string;
  status: string;
  url: string;
  repository?: string;
}

export interface AdoHistoryEntry {
  date: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
}

/**
 * Work item definition in YAML
 */
export interface WorkItem {
  type: WorkItemType;
  id: string; // Local reference ID (user-defined)
  title: string;
  description?: string;
  state?: WorkItemState | string;
  priority?: 1 | 2 | 3 | 4;
  tags?: string[];

  // Common fields
  assignedTo?: string;
  areaPath?: string;
  iterationPath?: string;

  // Epic/Feature specific
  valueArea?: 'Business' | 'Architectural';
  businessValue?: number;
  targetDate?: string;

  // PBI/Story specific
  acceptanceCriteria?: string;
  effort?: number;
  storyPoints?: number;

  // Task specific
  activity?: 'Development' | 'Testing' | 'Documentation' | 'Design' | 'Requirements';
  remainingWork?: number;
  originalEstimate?: number;
  completedWork?: number;

  // ADO sync metadata
  _ado?: AdoMetadata;

  // Child items
  children?: WorkItem[];
}

/**
 * Project configuration in YAML
 */
export interface ProjectConfig {
  organization: string;
  project: string;
  areaPath?: string;
  iterationPath?: string;
}

/**
 * Root YAML document structure
 */
export interface WorkItemsDocument {
  schemaVersion: string;
  hierarchyType: HierarchyType;
  project: ProjectConfig;
  workItems: WorkItem[];
}

/**
 * Sync operation result
 */
export interface SyncResult {
  localId: string;
  action: SyncAction;
  success: boolean;
  workItemId?: number;
  url?: string;
  error?: string;
  message?: string;
}

/**
 * Diff between local and ADO state
 */
export interface WorkItemDiff {
  localId: string;
  adoId?: number;
  status: 'new' | 'modified' | 'deleted' | 'unchanged' | 'conflict';
  changes: FieldChange[];
}

export interface FieldChange {
  field: string;
  localValue: unknown;
  adoValue: unknown;
}

/**
 * Conflict information
 */
export interface Conflict {
  localId: string;
  adoId: number;
  field: string;
  localValue: unknown;
  adoValue: unknown;
  adoModifiedAt: string;
  localSyncedAt: string;
}

/**
 * Hierarchy validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
}
