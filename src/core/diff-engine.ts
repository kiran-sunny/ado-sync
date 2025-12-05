/**
 * Diff Engine - Calculate differences between YAML and ADO
 */

import type {
  WorkItem,
  WorkItemsDocument,
  WorkItemDiff,
  FieldChange,
  AdoMetadata,
} from '../types/index.js';
import type { AdoWorkItemResponse } from '../types/ado-api.js';
import { flattenHierarchy } from './hierarchy.js';
import { REVERSE_FIELD_MAP } from '../types/ado-api.js';

/**
 * Fields to compare
 */
const COMPARE_FIELDS: Array<keyof WorkItem> = [
  'title',
  'description',
  'state',
  'priority',
  'assignedTo',
  'areaPath',
  'iterationPath',
  'acceptanceCriteria',
  'effort',
  'storyPoints',
  'businessValue',
  'valueArea',
  'targetDate',
  'remainingWork',
  'originalEstimate',
  'completedWork',
  'activity',
  'tags',
];

/**
 * Calculate diff between local work item and ADO work item
 */
export function diffWorkItem(
  local: WorkItem,
  ado: AdoWorkItemResponse | null
): WorkItemDiff {
  const changes: FieldChange[] = [];

  // New item (not in ADO)
  if (!ado) {
    return {
      localId: local.id,
      adoId: undefined,
      status: 'new',
      changes: COMPARE_FIELDS.filter(f => local[f] !== undefined).map(f => ({
        field: f,
        localValue: local[f],
        adoValue: undefined,
      })),
    };
  }

  // Compare each field
  for (const field of COMPARE_FIELDS) {
    const localValue = local[field];
    const adoValue = getAdoFieldValue(ado, field);

    if (!isEqual(localValue, adoValue)) {
      changes.push({
        field,
        localValue,
        adoValue,
      });
    }
  }

  // Determine status
  let status: WorkItemDiff['status'] = 'unchanged';
  if (changes.length > 0) {
    // Check if there's a conflict (ADO has newer revision)
    if (local._ado?.rev && ado.rev > local._ado.rev) {
      status = 'conflict';
    } else {
      status = 'modified';
    }
  }

  return {
    localId: local.id,
    adoId: ado.id,
    status,
    changes,
  };
}

/**
 * Get field value from ADO work item response
 */
function getAdoFieldValue(ado: AdoWorkItemResponse, field: keyof WorkItem): unknown {
  const fields = ado.fields;

  switch (field) {
    case 'title':
      return fields['System.Title'];
    case 'description':
      return fields['System.Description'];
    case 'state':
      return fields['System.State'];
    case 'priority':
      return fields['Microsoft.VSTS.Common.Priority'];
    case 'assignedTo':
      return fields['System.AssignedTo']?.displayName;
    case 'areaPath':
      return fields['System.AreaPath'];
    case 'iterationPath':
      return fields['System.IterationPath'];
    case 'acceptanceCriteria':
      return fields['Microsoft.VSTS.Common.AcceptanceCriteria'];
    case 'effort':
      return fields['Microsoft.VSTS.Scheduling.Effort'];
    case 'storyPoints':
      return fields['Microsoft.VSTS.Scheduling.StoryPoints'];
    case 'businessValue':
      return fields['Microsoft.VSTS.Common.BusinessValue'];
    case 'valueArea':
      return fields['Microsoft.VSTS.Common.ValueArea'];
    case 'targetDate':
      return fields['Microsoft.VSTS.Scheduling.TargetDate'];
    case 'remainingWork':
      return fields['Microsoft.VSTS.Scheduling.RemainingWork'];
    case 'originalEstimate':
      return fields['Microsoft.VSTS.Scheduling.OriginalEstimate'];
    case 'completedWork':
      return fields['Microsoft.VSTS.Scheduling.CompletedWork'];
    case 'activity':
      return fields['Microsoft.VSTS.Common.Activity'];
    case 'tags':
      const tagsString = fields['System.Tags'];
      return tagsString ? tagsString.split('; ').filter(Boolean) : undefined;
    default:
      return undefined;
  }
}

/**
 * Compare two values for equality
 */
function isEqual(a: unknown, b: unknown): boolean {
  // Handle undefined/null
  if (a === undefined || a === null) {
    return b === undefined || b === null;
  }
  if (b === undefined || b === null) {
    return false;
  }

  // Handle arrays (tags)
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
  }

  // Handle strings (trim and compare)
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim() === b.trim();
  }

  // Direct comparison
  return a === b;
}

/**
 * Calculate diffs for all items in document
 */
export function diffDocument(
  doc: WorkItemsDocument,
  adoItems: Map<number, AdoWorkItemResponse>
): WorkItemDiff[] {
  const flattened = flattenHierarchy(doc);
  const diffs: WorkItemDiff[] = [];

  for (const item of flattened) {
    const adoId = item._ado?.workItemId;
    const adoItem = adoId ? adoItems.get(adoId) ?? null : null;
    diffs.push(diffWorkItem(item, adoItem));
  }

  return diffs;
}

/**
 * Check if item has local changes
 */
export function hasLocalChanges(local: WorkItem, ado: AdoWorkItemResponse): boolean {
  const diff = diffWorkItem(local, ado);
  return diff.changes.length > 0;
}

/**
 * Get summary of changes
 */
export function getDiffSummary(diffs: WorkItemDiff[]): {
  new: number;
  modified: number;
  unchanged: number;
  conflict: number;
  deleted: number;
} {
  return {
    new: diffs.filter(d => d.status === 'new').length,
    modified: diffs.filter(d => d.status === 'modified').length,
    unchanged: diffs.filter(d => d.status === 'unchanged').length,
    conflict: diffs.filter(d => d.status === 'conflict').length,
    deleted: diffs.filter(d => d.status === 'deleted').length,
  };
}

/**
 * Format field change for display
 */
export function formatFieldChange(change: FieldChange): string {
  const local = formatValue(change.localValue);
  const ado = formatValue(change.adoValue);
  return `${change.field}: ${ado} → ${local}`;
}

/**
 * Format value for display
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '(empty)';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'string' && value.length > 50) {
    return value.substring(0, 47) + '...';
  }
  return String(value);
}
