/**
 * Import Engine - Import work items from Azure DevOps into YAML
 */

import type { AdoClient } from '../ado/client.js';
import type { AdoWorkItemResponse, AdoWorkItemFields, REVERSE_FIELD_MAP } from '../types/ado-api.js';
import type {
  WorkItem,
  WorkItemsDocument,
  HierarchyType,
  AdoMetadata,
  AdoComment,
  AdoPullRequest,
} from '../types/work-item.js';
import type { ResolvedConfig } from '../types/config.js';
import { getWorkItem, getChildIds, extractAdoMetadata } from '../ado/work-items.js';
import { getAllComments } from '../ado/comments.js';
import { getLinkedPullRequests } from '../ado/pull-requests.js';
import { REVERSE_FIELD_MAP as reverseFieldMap } from '../types/ado-api.js';

/**
 * Import options
 */
export interface ImportOptions {
  includeComments?: boolean;
  includePRs?: boolean;
  maxDepth?: number;
  filterTag?: string;
  filterType?: string;
}

/**
 * Import result for a single work item
 */
export interface ImportResult {
  adoId: number;
  localId: string;
  type: string;
  title: string;
  success: boolean;
  error?: string;
  childCount: number;
}

/**
 * Import a work item tree from Azure DevOps
 */
export async function importFromAdo(
  client: AdoClient,
  parentId: number,
  config: ResolvedConfig,
  options: ImportOptions = {}
): Promise<{ document: WorkItemsDocument; results: ImportResult[] }> {
  const { includeComments = true, includePRs = true, maxDepth = 10, filterTag, filterType } = options;
  const results: ImportResult[] = [];

  // Fetch the entire tree
  const tree = await fetchWorkItemTree(client, parentId, config, {
    includeComments,
    includePRs,
    maxDepth,
    filterTag,
    filterType,
    currentDepth: 0,
    results,
    isRoot: true,
  });

  if (!tree) {
    throw new Error(`Could not fetch work item ${parentId}`);
  }

  // Detect hierarchy type from the work item types in the tree
  const hierarchyType = detectHierarchyType(tree);

  // Build the document
  const document: WorkItemsDocument = {
    schemaVersion: '1.0',
    hierarchyType,
    project: {
      organization: config.organization,
      project: config.project,
    },
    workItems: [tree],
  };

  return { document, results };
}

/**
 * Recursively fetch a work item and all its children
 *
 * Filter behavior:
 * - Filters only apply to direct children of the root item
 * - Once an item matches the filter, ALL its descendants are included (no further filtering)
 * - This allows importing "all PBIs with tag X and all their tasks"
 */
async function fetchWorkItemTree(
  client: AdoClient,
  workItemId: number,
  config: ResolvedConfig,
  context: {
    includeComments: boolean;
    includePRs: boolean;
    maxDepth: number;
    filterTag?: string;
    filterType?: string;
    currentDepth: number;
    results: ImportResult[];
    isRoot?: boolean;
    filterDisabled?: boolean; // When true, skip filtering (for descendants of matched items)
  }
): Promise<WorkItem | null> {
  const { includeComments, includePRs, maxDepth, filterTag, filterType, currentDepth, results, isRoot, filterDisabled } = context;

  // Depth check
  if (currentDepth > maxDepth) {
    return null;
  }

  // Determine if we should apply filtering at this level
  // Filters only apply to direct children of the root (depth 1) and only if filterDisabled is false
  const hasFilters = !!(filterTag || filterType);
  const shouldApplyFilter = hasFilters && !filterDisabled && isRoot;

  try {
    // Fetch work item with relations
    const adoItem = await getWorkItem(client, workItemId, 'Relations');

    // Transform to YAML format
    const workItem = transformAdoToYaml(adoItem, config);

    // Fetch comments if enabled
    if (includeComments) {
      try {
        const comments = await getAllComments(client, workItemId);
        if (comments.length > 0 && workItem._ado) {
          workItem._ado.comments = comments;
        }
      } catch {
        // Ignore comment fetch errors
      }
    }

    // Fetch PRs if enabled
    if (includePRs) {
      try {
        const prs = await getLinkedPullRequests(client, adoItem);
        if (prs.length > 0 && workItem._ado) {
          workItem._ado.linkedPRs = prs;
        }
      } catch {
        // Ignore PR fetch errors
      }
    }

    // Get child IDs
    const childIds = getChildIds(adoItem);

    // Record result
    results.push({
      adoId: workItemId,
      localId: workItem.id,
      type: workItem.type,
      title: workItem.title,
      success: true,
      childCount: childIds.length,
    });

    // Recursively fetch children
    if (childIds.length > 0) {
      const children: WorkItem[] = [];

      for (const childId of childIds) {
        // When we need to apply filter, we first fetch the child to check if it matches
        const child = await fetchWorkItemTree(client, childId, config, {
          ...context,
          currentDepth: currentDepth + 1,
          isRoot: false,
          // If parent is applying filter, children should NOT apply filter (include all descendants)
          filterDisabled: shouldApplyFilter ? true : filterDisabled,
        });

        if (child) {
          if (shouldApplyFilter) {
            // Apply filters to direct children of root
            const matchesFilter = shouldIncludeItem(child, filterTag, filterType);
            if (matchesFilter) {
              children.push(child);
            }
          } else {
            // No filtering - include all children
            children.push(child);
          }
        }
      }

      if (children.length > 0) {
        workItem.children = children;
      }
    }

    return workItem;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({
      adoId: workItemId,
      localId: `ado-${workItemId}`,
      type: 'Unknown',
      title: 'Failed to fetch',
      success: false,
      error: message,
      childCount: 0,
    });
    return null;
  }
}

/**
 * Transform ADO work item response to YAML format
 */
function transformAdoToYaml(
  adoItem: AdoWorkItemResponse,
  config: ResolvedConfig
): WorkItem {
  const fields = adoItem.fields;
  const type = fields['System.WorkItemType'] as string;

  // Generate local ID from type and ADO ID
  const localId = generateLocalId(type, adoItem.id);

  // Build the work item
  const workItem: WorkItem = {
    type: type as WorkItem['type'],
    id: localId,
    title: fields['System.Title'],
  };

  // Map optional fields
  if (fields['System.Description']) {
    workItem.description = stripHtml(fields['System.Description']);
  }

  if (fields['System.State']) {
    workItem.state = fields['System.State'];
  }

  if (fields['Microsoft.VSTS.Common.Priority']) {
    workItem.priority = fields['Microsoft.VSTS.Common.Priority'] as 1 | 2 | 3 | 4;
  }

  if (fields['System.Tags']) {
    workItem.tags = fields['System.Tags'].split(';').map((t: string) => t.trim()).filter(Boolean);
  }

  if (fields['System.AssignedTo']) {
    workItem.assignedTo = fields['System.AssignedTo'].displayName || fields['System.AssignedTo'].uniqueName;
  }

  if (fields['System.AreaPath']) {
    workItem.areaPath = fields['System.AreaPath'];
  }

  if (fields['System.IterationPath']) {
    workItem.iterationPath = fields['System.IterationPath'];
  }

  // Epic/Feature fields
  if (fields['Microsoft.VSTS.Common.ValueArea']) {
    workItem.valueArea = fields['Microsoft.VSTS.Common.ValueArea'] as 'Business' | 'Architectural';
  }

  if (fields['Microsoft.VSTS.Common.BusinessValue']) {
    workItem.businessValue = fields['Microsoft.VSTS.Common.BusinessValue'];
  }

  if (fields['Microsoft.VSTS.Scheduling.TargetDate']) {
    workItem.targetDate = fields['Microsoft.VSTS.Scheduling.TargetDate'];
  }

  // PBI/Story fields
  if (fields['Microsoft.VSTS.Common.AcceptanceCriteria']) {
    workItem.acceptanceCriteria = stripHtml(fields['Microsoft.VSTS.Common.AcceptanceCriteria']);
  }

  if (fields['Microsoft.VSTS.Scheduling.Effort']) {
    workItem.effort = fields['Microsoft.VSTS.Scheduling.Effort'];
  }

  if (fields['Microsoft.VSTS.Scheduling.StoryPoints']) {
    workItem.storyPoints = fields['Microsoft.VSTS.Scheduling.StoryPoints'];
  }

  // Task fields
  if (fields['Microsoft.VSTS.Common.Activity']) {
    workItem.activity = fields['Microsoft.VSTS.Common.Activity'] as WorkItem['activity'];
  }

  if (fields['Microsoft.VSTS.Scheduling.RemainingWork']) {
    workItem.remainingWork = fields['Microsoft.VSTS.Scheduling.RemainingWork'];
  }

  if (fields['Microsoft.VSTS.Scheduling.OriginalEstimate']) {
    workItem.originalEstimate = fields['Microsoft.VSTS.Scheduling.OriginalEstimate'];
  }

  if (fields['Microsoft.VSTS.Scheduling.CompletedWork']) {
    workItem.completedWork = fields['Microsoft.VSTS.Scheduling.CompletedWork'];
  }

  // Add ADO metadata
  workItem._ado = extractAdoMetadata(adoItem, config.project, config.organization);

  return workItem;
}

/**
 * Generate a local ID from work item type and ADO ID
 */
function generateLocalId(type: string, adoId: number): string {
  const typePrefix = getTypePrefix(type);
  return `${typePrefix}-${adoId}`;
}

/**
 * Get prefix for work item type
 */
function getTypePrefix(type: string): string {
  const prefixMap: Record<string, string> = {
    'Epic': 'epic',
    'Feature': 'feat',
    'Product Backlog Item': 'pbi',
    'User Story': 'story',
    'Task': 'task',
    'Bug': 'bug',
    'Issue': 'issue',
  };

  return prefixMap[type] || type.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Strip HTML tags from text
 */
function stripHtml(html: string): string {
  if (!html) return '';

  // Replace common HTML entities
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

/**
 * Detect hierarchy type from work items in tree
 */
function detectHierarchyType(rootItem: WorkItem): HierarchyType {
  const types = new Set<string>();
  collectTypes(rootItem, types);

  const hasEpic = types.has('Epic');
  const hasFeature = types.has('Feature');
  const hasPBI = types.has('Product Backlog Item') || types.has('User Story');
  const hasTask = types.has('Task');

  if (hasEpic && hasFeature && hasPBI) {
    return 'full';
  }

  if (hasFeature && hasPBI) {
    return 'medium';
  }

  return 'simple';
}

/**
 * Collect all work item types in a tree
 */
function collectTypes(item: WorkItem, types: Set<string>): void {
  types.add(item.type);
  if (item.children) {
    for (const child of item.children) {
      collectTypes(child, types);
    }
  }
}

/**
 * Check if an item matches the filter criteria
 */
function shouldIncludeItem(
  item: WorkItem,
  filterTag?: string,
  filterType?: string
): boolean {
  // If no filters, include everything
  if (!filterTag && !filterType) {
    return true;
  }

  // Check type filter
  if (filterType && item.type !== filterType) {
    return false;
  }

  // Check tag filter
  if (filterTag) {
    const itemTags = item.tags || [];
    const hasTag = itemTags.some(tag =>
      tag.toLowerCase() === filterTag.toLowerCase()
    );
    if (!hasTag) {
      return false;
    }
  }

  return true;
}

/**
 * Count total items in a tree
 */
export function countItems(item: WorkItem): number {
  let count = 1;
  if (item.children) {
    for (const child of item.children) {
      count += countItems(child);
    }
  }
  return count;
}
