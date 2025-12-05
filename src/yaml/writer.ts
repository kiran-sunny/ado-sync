/**
 * YAML Writer - Serializes work items back to YAML
 */

import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import type { WorkItemsDocument, WorkItem, AdoMetadata } from '../types/index.js';

/**
 * YAML dump options for consistent formatting
 */
const YAML_OPTIONS: yaml.DumpOptions = {
  indent: 2,
  lineWidth: 120,
  noRefs: true,
  quotingType: '"',
  forceQuotes: false,
  sortKeys: false,
};

/**
 * Write WorkItemsDocument to YAML file
 */
export async function writeYamlFile(filePath: string, doc: WorkItemsDocument): Promise<void> {
  const content = serializeYaml(doc);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Serialize WorkItemsDocument to YAML string
 */
export function serializeYaml(doc: WorkItemsDocument): string {
  // Clean up the document before serialization
  const cleanDoc = cleanDocument(doc);
  return yaml.dump(cleanDoc, YAML_OPTIONS);
}

/**
 * Clean document for serialization (remove undefined/null values)
 */
function cleanDocument(doc: WorkItemsDocument): WorkItemsDocument {
  return {
    schemaVersion: doc.schemaVersion,
    hierarchyType: doc.hierarchyType,
    project: {
      organization: doc.project.organization,
      project: doc.project.project,
      ...(doc.project.areaPath && { areaPath: doc.project.areaPath }),
      ...(doc.project.iterationPath && { iterationPath: doc.project.iterationPath }),
    },
    workItems: doc.workItems.map(cleanWorkItem),
  };
}

/**
 * Clean work item recursively
 */
function cleanWorkItem(item: WorkItem): WorkItem {
  const cleaned: Partial<WorkItem> = {};

  // Core required fields first
  cleaned.type = item.type;
  cleaned.id = item.id;
  cleaned.title = item.title;

  // Optional fields (in order)
  if (item.description !== undefined) cleaned.description = item.description;
  if (item.state !== undefined) cleaned.state = item.state;
  if (item.priority !== undefined) cleaned.priority = item.priority;
  if (item.tags !== undefined && item.tags.length > 0) cleaned.tags = item.tags;
  if (item.assignedTo !== undefined) cleaned.assignedTo = item.assignedTo;
  if (item.areaPath !== undefined) cleaned.areaPath = item.areaPath;
  if (item.iterationPath !== undefined) cleaned.iterationPath = item.iterationPath;

  // Epic/Feature fields
  if (item.valueArea !== undefined) cleaned.valueArea = item.valueArea;
  if (item.businessValue !== undefined) cleaned.businessValue = item.businessValue;
  if (item.targetDate !== undefined) cleaned.targetDate = item.targetDate;

  // PBI/Story fields
  if (item.acceptanceCriteria !== undefined) cleaned.acceptanceCriteria = item.acceptanceCriteria;
  if (item.effort !== undefined) cleaned.effort = item.effort;
  if (item.storyPoints !== undefined) cleaned.storyPoints = item.storyPoints;

  // Task fields
  if (item.activity !== undefined) cleaned.activity = item.activity;
  if (item.remainingWork !== undefined) cleaned.remainingWork = item.remainingWork;
  if (item.originalEstimate !== undefined) cleaned.originalEstimate = item.originalEstimate;
  if (item.completedWork !== undefined) cleaned.completedWork = item.completedWork;

  // ADO metadata (cleaned)
  if (item._ado !== undefined) {
    cleaned._ado = cleanAdoMetadata(item._ado);
  }

  // Children (recursive)
  if (item.children !== undefined && item.children.length > 0) {
    cleaned.children = item.children.map(cleanWorkItem);
  }

  return cleaned as WorkItem;
}

/**
 * Clean ADO metadata
 */
function cleanAdoMetadata(ado: AdoMetadata): AdoMetadata {
  const cleaned: AdoMetadata = {
    workItemId: ado.workItemId,
    url: ado.url,
    rev: ado.rev,
    lastSyncedAt: ado.lastSyncedAt,
  };

  if (ado.etag !== undefined) cleaned.etag = ado.etag;
  if (ado.state !== undefined) cleaned.state = ado.state;
  if (ado.assignedTo !== undefined) cleaned.assignedTo = ado.assignedTo;
  if (ado.comments !== undefined && ado.comments.length > 0) cleaned.comments = ado.comments;
  if (ado.linkedPRs !== undefined && ado.linkedPRs.length > 0) cleaned.linkedPRs = ado.linkedPRs;
  if (ado.history !== undefined && ado.history.length > 0) cleaned.history = ado.history;

  return cleaned;
}

/**
 * Clean object by removing undefined/null values
 */
function cleanObject<T extends Record<string, unknown>>(obj: T): T {
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      cleaned[key] = value;
    }
  }

  return cleaned as T;
}

/**
 * Update ADO metadata for a specific work item in the document
 */
export function updateWorkItemAdoMetadata(
  doc: WorkItemsDocument,
  localId: string,
  adoMetadata: Partial<AdoMetadata>
): boolean {
  function updateItem(items: WorkItem[]): boolean {
    for (const item of items) {
      if (item.id === localId) {
        item._ado = {
          ...(item._ado ?? {
            workItemId: null,
            url: null,
            rev: null,
            lastSyncedAt: null,
          }),
          ...adoMetadata,
        };
        return true;
      }
      if (item.children && item.children.length > 0) {
        if (updateItem(item.children)) {
          return true;
        }
      }
    }
    return false;
  }

  return updateItem(doc.workItems);
}

/**
 * Create a backup of the YAML file
 */
export async function backupYamlFile(filePath: string): Promise<string> {
  const backupPath = `${filePath}.backup.${Date.now()}`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}
