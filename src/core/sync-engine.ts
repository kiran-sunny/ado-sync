/**
 * Sync Engine - Main orchestration for push/pull operations
 */

import type {
  WorkItem,
  WorkItemsDocument,
  SyncResult,
  SyncAction,
  ConflictStrategy,
  Conflict,
  AdoMetadata,
} from '../types/index.js';
import type { AdoWorkItemResponse } from '../types/ado-api.js';
import type { AdoClient } from '../ado/client.js';
import type { ResolvedConfig } from '../types/config.js';
import {
  createWorkItem,
  updateWorkItem,
  getWorkItem,
  getWorkItems,
  addParentLink,
  extractAdoMetadata,
} from '../ado/work-items.js';
import { getAllComments } from '../ado/comments.js';
import { getLinkedPullRequests } from '../ado/pull-requests.js';
import { flattenHierarchy, type WorkItemWithParent } from './hierarchy.js';
import { diffWorkItem, hasLocalChanges } from './diff-engine.js';
import { matchesFilter } from '../utils/index.js';
import { debug, info, warn, error as logError } from '../utils/logger.js';

/**
 * Push options
 */
export interface PushOptions {
  dryRun?: boolean;
  force?: boolean;
  createOnly?: boolean;
  updateOnly?: boolean;
  filter?: string;
}

/**
 * Pull options
 */
export interface PullOptions {
  includeComments?: boolean;
  includePRs?: boolean;
  includeHistory?: boolean;
  overwriteLocal?: boolean;
}

/**
 * Sync decision for an item
 */
interface SyncDecision {
  action: SyncAction;
  reason: string;
  conflict?: Conflict;
}

/**
 * Determine sync action for a work item
 */
async function determineSyncAction(
  client: AdoClient,
  item: WorkItem,
  options: PushOptions
): Promise<SyncDecision> {
  const adoId = item._ado?.workItemId;

  // No ADO ID = new item
  if (!adoId) {
    if (options.updateOnly) {
      return { action: 'skip', reason: 'Update-only mode, skipping new item' };
    }
    return { action: 'create', reason: 'No ADO ID - new item' };
  }

  // Create-only mode
  if (options.createOnly) {
    return { action: 'skip', reason: 'Create-only mode, skipping existing item' };
  }

  // Get current ADO state
  let adoItem: AdoWorkItemResponse;
  try {
    adoItem = await getWorkItem(client, adoId, 'Relations');
  } catch {
    // Work item might have been deleted
    if (options.updateOnly) {
      return { action: 'skip', reason: 'ADO item not found, skipping in update-only mode' };
    }
    return { action: 'create', reason: 'ADO item deleted - recreating' };
  }

  // Check for conflicts
  if (!options.force && item._ado?.rev && adoItem.rev > item._ado.rev) {
    return {
      action: 'conflict',
      reason: 'ADO modified since last sync',
      conflict: {
        localId: item.id,
        adoId,
        field: 'revision',
        localValue: item._ado.rev,
        adoValue: adoItem.rev,
        adoModifiedAt: adoItem.fields['System.ChangedDate'],
        localSyncedAt: item._ado.lastSyncedAt ?? 'unknown',
      },
    };
  }

  // Check if local changes exist
  if (hasLocalChanges(item, adoItem)) {
    return { action: 'update', reason: 'Local changes detected' };
  }

  return { action: 'skip', reason: 'No changes' };
}

/**
 * Push work items to Azure DevOps
 */
export async function pushWorkItems(
  client: AdoClient,
  doc: WorkItemsDocument,
  config: ResolvedConfig,
  options: PushOptions = {}
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const filter = options.filter ?? '*';

  // Flatten hierarchy (parent before children)
  const items = flattenHierarchy(doc);

  // Filter items
  const filteredItems = items.filter(item => matchesFilter(item.id, filter));

  info(`Processing ${filteredItems.length} work items...`);

  for (const item of filteredItems) {
    // Determine action
    const decision = await determineSyncAction(client, item, options);
    debug(`${item.id}: ${decision.action} - ${decision.reason}`);

    // Handle dry-run
    if (options.dryRun) {
      results.push({
        localId: item.id,
        action: decision.action,
        success: true,
        message: `[DRY RUN] Would ${decision.action}: ${decision.reason}`,
      });
      continue;
    }

    // Execute action
    try {
      const result = await executeAction(client, item, decision, config);
      results.push(result);

      // Update item metadata after successful create/update
      if (result.success && (result.action === 'create' || result.action === 'update')) {
        // Update the item in the document with ADO metadata
        const adoItem = await getWorkItem(client, result.workItemId!, 'Relations');
        const metadata = extractAdoMetadata(adoItem, config.project, config.organization);
        updateItemMetadata(item, metadata);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logError(`Failed to ${decision.action} ${item.id}: ${errorMessage}`);
      results.push({
        localId: item.id,
        action: decision.action,
        success: false,
        error: errorMessage,
      });
    }
  }

  return results;
}

/**
 * Execute sync action
 */
async function executeAction(
  client: AdoClient,
  item: WorkItemWithParent,
  decision: SyncDecision,
  config: ResolvedConfig
): Promise<SyncResult> {
  switch (decision.action) {
    case 'create': {
      // Apply defaults
      const fields = applyDefaults(item, config);

      // Create work item
      const response = await createWorkItem(client, item.type, fields);

      // Add parent link if parent exists and has ADO ID
      if (item.parent?._ado?.workItemId) {
        await addParentLink(client, response.id, item.parent._ado.workItemId);
      }

      return {
        localId: item.id,
        action: 'create',
        success: true,
        workItemId: response.id,
        url: `https://dev.azure.com/${config.organization}/${config.project}/_workitems/edit/${response.id}`,
        message: `Created work item #${response.id}`,
      };
    }

    case 'update': {
      const adoId = item._ado!.workItemId!;
      const expectedRev = item._ado?.rev ?? undefined;

      await updateWorkItem(client, adoId, item, expectedRev);

      return {
        localId: item.id,
        action: 'update',
        success: true,
        workItemId: adoId,
        url: `https://dev.azure.com/${config.organization}/${config.project}/_workitems/edit/${adoId}`,
        message: `Updated work item #${adoId}`,
      };
    }

    case 'skip':
      return {
        localId: item.id,
        action: 'skip',
        success: true,
        workItemId: item._ado?.workItemId ?? undefined,
        message: decision.reason,
      };

    case 'conflict':
      return {
        localId: item.id,
        action: 'conflict',
        success: false,
        workItemId: item._ado?.workItemId ?? undefined,
        error: decision.reason,
      };

    default:
      return {
        localId: item.id,
        action: 'skip',
        success: true,
        message: 'Unknown action',
      };
  }
}

/**
 * Apply default values from config
 */
function applyDefaults(item: WorkItem, config: ResolvedConfig): WorkItem {
  return {
    ...item,
    areaPath: item.areaPath ?? config.defaults.areaPath,
    iterationPath: item.iterationPath ?? config.defaults.iterationPath,
    state: item.state ?? config.defaults.state,
    priority: item.priority ?? config.defaults.priority as 1 | 2 | 3 | 4 | undefined,
  };
}

/**
 * Update item metadata in place
 */
function updateItemMetadata(item: WorkItem, metadata: AdoMetadata): void {
  item._ado = {
    ...item._ado,
    ...metadata,
  };
}

/**
 * Pull updates from Azure DevOps
 */
export async function pullWorkItems(
  client: AdoClient,
  doc: WorkItemsDocument,
  config: ResolvedConfig,
  options: PullOptions = {}
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  // Get all items with ADO IDs
  const items = flattenHierarchy(doc);
  const itemsWithAdoId = items.filter(item => item._ado?.workItemId);

  if (itemsWithAdoId.length === 0) {
    info('No items with ADO IDs to pull');
    return results;
  }

  // Batch fetch work items from ADO
  const adoIds = itemsWithAdoId.map(item => item._ado!.workItemId!);
  const adoItems = await getWorkItems(client, adoIds, 'Relations');
  const adoMap = new Map(adoItems.map(item => [item.id, item]));

  info(`Pulling ${itemsWithAdoId.length} work items from ADO...`);

  for (const item of itemsWithAdoId) {
    const adoId = item._ado!.workItemId!;
    const adoItem = adoMap.get(adoId);

    if (!adoItem) {
      warn(`Work item #${adoId} not found in ADO`);
      results.push({
        localId: item.id,
        action: 'skip',
        success: false,
        workItemId: adoId,
        error: 'Work item not found in ADO',
      });
      continue;
    }

    try {
      // Update metadata
      const metadata = extractAdoMetadata(adoItem, config.project, config.organization);

      // Pull comments if requested
      if (options.includeComments) {
        metadata.comments = await getAllComments(client, adoId);
      }

      // Pull PRs if requested
      if (options.includePRs) {
        metadata.linkedPRs = await getLinkedPullRequests(client, adoItem);
      }

      // Update item
      updateItemMetadata(item, metadata);

      results.push({
        localId: item.id,
        action: 'update',
        success: true,
        workItemId: adoId,
        message: `Pulled updates for #${adoId}`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logError(`Failed to pull ${item.id}: ${errorMessage}`);
      results.push({
        localId: item.id,
        action: 'skip',
        success: false,
        workItemId: adoId,
        error: errorMessage,
      });
    }
  }

  return results;
}

/**
 * Bi-directional sync (pull then push)
 */
export async function syncWorkItems(
  client: AdoClient,
  doc: WorkItemsDocument,
  config: ResolvedConfig,
  strategy: ConflictStrategy,
  options: { dryRun?: boolean } = {}
): Promise<{ pullResults: SyncResult[]; pushResults: SyncResult[] }> {
  // First, pull from ADO
  info('Pulling changes from Azure DevOps...');
  const pullResults = await pullWorkItems(client, doc, config, {
    includeComments: config.sync.includeComments,
    includePRs: config.sync.includePRs,
    includeHistory: config.sync.includeHistory,
  });

  // Then, push to ADO
  info('Pushing changes to Azure DevOps...');
  const pushResults = await pushWorkItems(client, doc, config, {
    dryRun: options.dryRun,
    force: strategy === 'yaml-wins',
  });

  return { pullResults, pushResults };
}

/**
 * Get sync status for all items
 */
export async function getSyncStatus(
  client: AdoClient,
  doc: WorkItemsDocument
): Promise<
  Array<{
    localId: string;
    adoId: number | null;
    status: 'synced' | 'pending' | 'conflict' | 'new';
    lastSyncedAt: string | null;
  }>
> {
  const items = flattenHierarchy(doc);
  const status: Array<{
    localId: string;
    adoId: number | null;
    status: 'synced' | 'pending' | 'conflict' | 'new';
    lastSyncedAt: string | null;
  }> = [];

  // Get all items with ADO IDs
  const itemsWithAdoId = items.filter(item => item._ado?.workItemId);
  const adoIds = itemsWithAdoId.map(item => item._ado!.workItemId!);

  // Batch fetch from ADO
  const adoItems = adoIds.length > 0 ? await getWorkItems(client, adoIds, 'None') : [];
  const adoMap = new Map(adoItems.map(item => [item.id, item]));

  for (const item of items) {
    const adoId = item._ado?.workItemId ?? null;

    if (!adoId) {
      status.push({
        localId: item.id,
        adoId: null,
        status: 'new',
        lastSyncedAt: null,
      });
      continue;
    }

    const adoItem = adoMap.get(adoId);
    if (!adoItem) {
      status.push({
        localId: item.id,
        adoId,
        status: 'pending',
        lastSyncedAt: item._ado?.lastSyncedAt ?? null,
      });
      continue;
    }

    // Check for changes
    const diff = diffWorkItem(item, adoItem);

    if (diff.status === 'conflict') {
      status.push({
        localId: item.id,
        adoId,
        status: 'conflict',
        lastSyncedAt: item._ado?.lastSyncedAt ?? null,
      });
    } else if (diff.status === 'modified') {
      status.push({
        localId: item.id,
        adoId,
        status: 'pending',
        lastSyncedAt: item._ado?.lastSyncedAt ?? null,
      });
    } else {
      status.push({
        localId: item.id,
        adoId,
        status: 'synced',
        lastSyncedAt: item._ado?.lastSyncedAt ?? null,
      });
    }
  }

  return status;
}
