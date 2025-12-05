/**
 * Hierarchy Utilities - Tree traversal and work item hierarchy management
 */

import type { WorkItem, WorkItemsDocument, HierarchyType } from '../types/index.js';

/**
 * Work item with parent reference
 */
export interface WorkItemWithParent extends WorkItem {
  parent?: WorkItemWithParent;
  depth: number;
}

/**
 * Flatten hierarchy to array with parent references (depth-first, parent before children)
 */
export function flattenHierarchy(doc: WorkItemsDocument): WorkItemWithParent[] {
  const result: WorkItemWithParent[] = [];

  function traverse(items: WorkItem[], parent?: WorkItemWithParent, depth = 0) {
    for (const item of items) {
      const itemWithParent: WorkItemWithParent = {
        ...item,
        parent,
        depth,
      };
      result.push(itemWithParent);

      if (item.children && item.children.length > 0) {
        traverse(item.children, itemWithParent, depth + 1);
      }
    }
  }

  traverse(doc.workItems);
  return result;
}

/**
 * Traverse hierarchy in reverse order (children before parents)
 * Useful for deletion operations
 */
export function flattenHierarchyReverse(doc: WorkItemsDocument): WorkItemWithParent[] {
  const result: WorkItemWithParent[] = [];

  function traverse(items: WorkItem[], parent?: WorkItemWithParent, depth = 0) {
    for (const item of items) {
      const itemWithParent: WorkItemWithParent = {
        ...item,
        parent,
        depth,
      };

      // Process children first
      if (item.children && item.children.length > 0) {
        traverse(item.children, itemWithParent, depth + 1);
      }

      // Then add this item
      result.push(itemWithParent);
    }
  }

  traverse(doc.workItems);
  return result;
}

/**
 * Get all items at a specific depth level
 */
export function getItemsAtDepth(doc: WorkItemsDocument, targetDepth: number): WorkItem[] {
  const result: WorkItem[] = [];

  function traverse(items: WorkItem[], depth: number) {
    for (const item of items) {
      if (depth === targetDepth) {
        result.push(item);
      }
      if (item.children && item.children.length > 0 && depth < targetDepth) {
        traverse(item.children, depth + 1);
      }
    }
  }

  traverse(doc.workItems, 0);
  return result;
}

/**
 * Get maximum depth of hierarchy
 */
export function getMaxDepth(doc: WorkItemsDocument): number {
  let maxDepth = 0;

  function traverse(items: WorkItem[], depth: number) {
    maxDepth = Math.max(maxDepth, depth);
    for (const item of items) {
      if (item.children && item.children.length > 0) {
        traverse(item.children, depth + 1);
      }
    }
  }

  traverse(doc.workItems, 0);
  return maxDepth;
}

/**
 * Find item by local ID in hierarchy
 */
export function findItemById(doc: WorkItemsDocument, id: string): WorkItem | null {
  function search(items: WorkItem[]): WorkItem | null {
    for (const item of items) {
      if (item.id === id) {
        return item;
      }
      if (item.children && item.children.length > 0) {
        const found = search(item.children);
        if (found) return found;
      }
    }
    return null;
  }

  return search(doc.workItems);
}

/**
 * Find item by ADO work item ID
 */
export function findItemByAdoId(doc: WorkItemsDocument, adoId: number): WorkItem | null {
  function search(items: WorkItem[]): WorkItem | null {
    for (const item of items) {
      if (item._ado?.workItemId === adoId) {
        return item;
      }
      if (item.children && item.children.length > 0) {
        const found = search(item.children);
        if (found) return found;
      }
    }
    return null;
  }

  return search(doc.workItems);
}

/**
 * Get ancestors of an item (parent chain)
 */
export function getAncestors(doc: WorkItemsDocument, id: string): WorkItem[] {
  const ancestors: WorkItem[] = [];

  function search(items: WorkItem[], path: WorkItem[]): boolean {
    for (const item of items) {
      if (item.id === id) {
        ancestors.push(...path);
        return true;
      }
      if (item.children && item.children.length > 0) {
        if (search(item.children, [...path, item])) {
          return true;
        }
      }
    }
    return false;
  }

  search(doc.workItems, []);
  return ancestors;
}

/**
 * Get all descendants of an item
 */
export function getDescendants(item: WorkItem): WorkItem[] {
  const descendants: WorkItem[] = [];

  function collect(items: WorkItem[]) {
    for (const child of items) {
      descendants.push(child);
      if (child.children && child.children.length > 0) {
        collect(child.children);
      }
    }
  }

  if (item.children && item.children.length > 0) {
    collect(item.children);
  }

  return descendants;
}

/**
 * Count items in hierarchy
 */
export function countItems(items: WorkItem[]): number {
  let count = 0;

  function traverse(list: WorkItem[]) {
    for (const item of list) {
      count++;
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    }
  }

  traverse(items);
  return count;
}

/**
 * Get valid root types for hierarchy
 */
export function getValidRootTypes(hierarchyType: HierarchyType): string[] {
  const rootTypes: Record<HierarchyType, string[]> = {
    full: ['Epic'],
    medium: ['Feature'],
    simple: ['Product Backlog Item', 'User Story', 'Bug'],
  };
  return rootTypes[hierarchyType];
}

/**
 * Get valid child types for a work item type
 */
export function getValidChildTypes(parentType: string): string[] {
  const childTypes: Record<string, string[]> = {
    Epic: ['Feature'],
    Feature: ['Product Backlog Item', 'User Story', 'Bug'],
    'Product Backlog Item': ['Task'],
    'User Story': ['Task'],
    Bug: ['Task'],
    Task: [],
    Issue: ['Task'],
  };
  return childTypes[parentType] ?? [];
}

/**
 * Build ID map for quick lookup
 */
export function buildIdMap(doc: WorkItemsDocument): Map<string, WorkItem> {
  const map = new Map<string, WorkItem>();

  function traverse(items: WorkItem[]) {
    for (const item of items) {
      map.set(item.id, item);
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    }
  }

  traverse(doc.workItems);
  return map;
}

/**
 * Build ADO ID map for quick lookup
 */
export function buildAdoIdMap(doc: WorkItemsDocument): Map<number, WorkItem> {
  const map = new Map<number, WorkItem>();

  function traverse(items: WorkItem[]) {
    for (const item of items) {
      if (item._ado?.workItemId) {
        map.set(item._ado.workItemId, item);
      }
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    }
  }

  traverse(doc.workItems);
  return map;
}
