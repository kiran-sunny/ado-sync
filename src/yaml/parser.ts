/**
 * YAML Parser - Parses work item YAML files
 */

import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import type { WorkItemsDocument } from '../types/index.js';

/**
 * Parse YAML file into WorkItemsDocument
 */
export async function parseYamlFile(filePath: string): Promise<WorkItemsDocument> {
  const content = await fs.readFile(filePath, 'utf-8');
  return parseYaml(content);
}

/**
 * Parse YAML string into WorkItemsDocument
 */
export function parseYaml(content: string): WorkItemsDocument {
  const doc = yaml.load(content) as WorkItemsDocument;

  if (!doc) {
    throw new Error('Empty YAML document');
  }

  return doc;
}

/**
 * Parse YAML file with custom types support
 */
export async function parseYamlFileWithTypes(filePath: string): Promise<WorkItemsDocument> {
  const content = await fs.readFile(filePath, 'utf-8');
  return parseYamlWithTypes(content);
}

/**
 * Parse YAML with custom type handling
 */
export function parseYamlWithTypes(content: string): WorkItemsDocument {
  // Define custom types if needed (e.g., for dates)
  const schema = yaml.DEFAULT_SCHEMA;

  const doc = yaml.load(content, { schema }) as WorkItemsDocument;

  if (!doc) {
    throw new Error('Empty YAML document');
  }

  return doc;
}

/**
 * Check if file exists and is readable
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all local IDs from a document (for uniqueness validation)
 */
export function getAllLocalIds(doc: WorkItemsDocument): Set<string> {
  const ids = new Set<string>();

  function collectIds(items: WorkItemsDocument['workItems']) {
    for (const item of items) {
      ids.add(item.id);
      if (item.children && item.children.length > 0) {
        collectIds(item.children);
      }
    }
  }

  collectIds(doc.workItems);
  return ids;
}

/**
 * Find work item by local ID
 */
export function findWorkItemById(
  doc: WorkItemsDocument,
  id: string
): WorkItemsDocument['workItems'][0] | null {
  function search(items: WorkItemsDocument['workItems']): WorkItemsDocument['workItems'][0] | null {
    for (const item of items) {
      if (item.id === id) {
        return item;
      }
      if (item.children && item.children.length > 0) {
        const found = search(item.children);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  return search(doc.workItems);
}

/**
 * Count total work items in document
 */
export function countWorkItems(doc: WorkItemsDocument): number {
  let count = 0;

  function countItems(items: WorkItemsDocument['workItems']) {
    for (const item of items) {
      count++;
      if (item.children && item.children.length > 0) {
        countItems(item.children);
      }
    }
  }

  countItems(doc.workItems);
  return count;
}
