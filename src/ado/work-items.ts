/**
 * Work Items API - CRUD operations for Azure DevOps work items
 */

import type { AdoClient } from './client.js';
import type {
  AdoWorkItemResponse,
  BatchWorkItemsRequest,
  BatchWorkItemsResponse,
  JsonPatchOperation,
  FIELD_MAP,
} from '../types/ado-api.js';
import type { WorkItem, AdoMetadata } from '../types/work-item.js';
import { FIELD_MAP as fieldMap, LINK_TYPES } from '../types/ado-api.js';
import { chunk } from '../utils/index.js';

/**
 * Create a new work item
 */
export async function createWorkItem(
  client: AdoClient,
  type: string,
  fields: Partial<WorkItem>
): Promise<AdoWorkItemResponse> {
  const patchDocument = buildPatchDocument(fields);
  const project = client.getProject();
  const encodedType = encodeURIComponent(type);

  return client.post<AdoWorkItemResponse>(
    `/${project}/_apis/wit/workitems/$${encodedType}`,
    patchDocument
  );
}

/**
 * Update an existing work item
 */
export async function updateWorkItem(
  client: AdoClient,
  id: number,
  fields: Partial<WorkItem>,
  expectedRev?: number
): Promise<AdoWorkItemResponse> {
  const patchDocument = buildPatchDocument(fields);

  // Add revision check for optimistic concurrency
  if (expectedRev !== undefined) {
    patchDocument.unshift({
      op: 'test',
      path: '/rev',
      value: expectedRev,
    });
  }

  const project = client.getProject();

  return client.patch<AdoWorkItemResponse>(
    `/${project}/_apis/wit/workitems/${id}`,
    patchDocument
  );
}

/**
 * Get a single work item by ID
 */
export async function getWorkItem(
  client: AdoClient,
  id: number,
  expand?: 'None' | 'Relations' | 'Fields' | 'Links' | 'All'
): Promise<AdoWorkItemResponse> {
  const project = client.getProject();

  return client.get<AdoWorkItemResponse>(
    `/${project}/_apis/wit/workitems/${id}`,
    expand ? { $expand: expand } : undefined
  );
}

/**
 * Get multiple work items by IDs (batch)
 */
export async function getWorkItems(
  client: AdoClient,
  ids: number[],
  expand?: 'None' | 'Relations' | 'Fields' | 'Links' | 'All'
): Promise<AdoWorkItemResponse[]> {
  if (ids.length === 0) {
    return [];
  }

  const project = client.getProject();
  const results: AdoWorkItemResponse[] = [];

  // ADO batch limit is 200 items
  const batches = chunk(ids, 200);

  for (const batch of batches) {
    const request: BatchWorkItemsRequest = {
      ids: batch,
      $expand: expand ?? 'Relations',
    };

    const response = await client.post<BatchWorkItemsResponse>(
      `/${project}/_apis/wit/workitemsbatch`,
      request
    );

    results.push(...response.value);
  }

  return results;
}

/**
 * Delete a work item
 */
export async function deleteWorkItem(
  client: AdoClient,
  id: number,
  destroy = false
): Promise<void> {
  const project = client.getProject();

  await client.delete(`/${project}/_apis/wit/workitems/${id}`, {
    destroy: destroy.toString(),
  });
}

/**
 * Add parent-child link between work items
 */
export async function addParentLink(
  client: AdoClient,
  childId: number,
  parentId: number
): Promise<AdoWorkItemResponse> {
  const baseUrl = client.getBaseUrl();
  const project = client.getProject();

  const patchDocument: JsonPatchOperation[] = [
    {
      op: 'add',
      path: '/relations/-',
      value: {
        rel: LINK_TYPES.PARENT,
        url: `${baseUrl}/${project}/_apis/wit/workItems/${parentId}`,
      },
    },
  ];

  return client.patch<AdoWorkItemResponse>(
    `/${project}/_apis/wit/workitems/${childId}`,
    patchDocument
  );
}

/**
 * Remove parent link from work item
 */
export async function removeParentLink(
  client: AdoClient,
  childId: number,
  relationIndex: number
): Promise<AdoWorkItemResponse> {
  const project = client.getProject();

  const patchDocument: JsonPatchOperation[] = [
    {
      op: 'remove',
      path: `/relations/${relationIndex}`,
    },
  ];

  return client.patch<AdoWorkItemResponse>(
    `/${project}/_apis/wit/workitems/${childId}`,
    patchDocument
  );
}

/**
 * Build JSON Patch document from work item fields
 */
function buildPatchDocument(fields: Partial<WorkItem>): JsonPatchOperation[] {
  const operations: JsonPatchOperation[] = [];

  // Map YAML fields to ADO fields
  const fieldMappings: Array<{
    yamlField: keyof WorkItem;
    adoField: string;
    transform?: (value: unknown) => unknown;
  }> = [
    { yamlField: 'title', adoField: fieldMap['title']! },
    { yamlField: 'description', adoField: fieldMap['description']! },
    { yamlField: 'state', adoField: fieldMap['state']! },
    { yamlField: 'assignedTo', adoField: fieldMap['assignedTo']! },
    { yamlField: 'areaPath', adoField: fieldMap['areaPath']! },
    { yamlField: 'iterationPath', adoField: fieldMap['iterationPath']! },
    { yamlField: 'priority', adoField: fieldMap['priority']! },
    { yamlField: 'effort', adoField: fieldMap['effort']! },
    { yamlField: 'storyPoints', adoField: fieldMap['storyPoints']! },
    { yamlField: 'businessValue', adoField: fieldMap['businessValue']! },
    { yamlField: 'acceptanceCriteria', adoField: fieldMap['acceptanceCriteria']! },
    { yamlField: 'valueArea', adoField: fieldMap['valueArea']! },
    { yamlField: 'targetDate', adoField: fieldMap['targetDate']! },
    { yamlField: 'remainingWork', adoField: fieldMap['remainingWork']! },
    { yamlField: 'originalEstimate', adoField: fieldMap['originalEstimate']! },
    { yamlField: 'completedWork', adoField: fieldMap['completedWork']! },
    { yamlField: 'activity', adoField: fieldMap['activity']! },
    {
      yamlField: 'tags',
      adoField: fieldMap['tags']!,
      transform: (value: unknown) => {
        if (Array.isArray(value)) {
          return value.join('; ');
        }
        return value;
      },
    },
  ];

  for (const mapping of fieldMappings) {
    const value = fields[mapping.yamlField];
    if (value !== undefined && value !== null) {
      const transformedValue = mapping.transform ? mapping.transform(value) : value;
      operations.push({
        op: 'add',
        path: `/fields/${mapping.adoField}`,
        value: transformedValue,
      });
    }
  }

  return operations;
}

/**
 * Extract ADO metadata from work item response
 */
export function extractAdoMetadata(
  response: AdoWorkItemResponse,
  project: string,
  organization: string
): AdoMetadata {
  const fields = response.fields;

  return {
    workItemId: response.id,
    url: `https://dev.azure.com/${organization}/${project}/_workitems/edit/${response.id}`,
    rev: response.rev,
    lastSyncedAt: new Date().toISOString(),
    state: fields['System.State'],
    assignedTo: fields['System.AssignedTo']?.displayName,
  };
}

/**
 * Check if work item has parent link
 */
export function hasParentLink(workItem: AdoWorkItemResponse): boolean {
  if (!workItem.relations) {
    return false;
  }

  return workItem.relations.some(rel => rel.rel === LINK_TYPES.PARENT);
}

/**
 * Get parent work item ID from relations
 */
export function getParentId(workItem: AdoWorkItemResponse): number | null {
  if (!workItem.relations) {
    return null;
  }

  const parentRelation = workItem.relations.find(rel => rel.rel === LINK_TYPES.PARENT);
  if (!parentRelation) {
    return null;
  }

  // Extract ID from URL
  const match = parentRelation.url.match(/\/workItems\/(\d+)$/);
  return match?.[1] ? parseInt(match[1], 10) : null;
}

/**
 * Get child work item IDs from relations
 */
export function getChildIds(workItem: AdoWorkItemResponse): number[] {
  if (!workItem.relations) {
    return [];
  }

  return workItem.relations
    .filter(rel => rel.rel === LINK_TYPES.CHILD)
    .map(rel => {
      const match = rel.url.match(/\/workItems\/(\d+)$/);
      return match?.[1] ? parseInt(match[1], 10) : null;
    })
    .filter((id): id is number => id !== null);
}
