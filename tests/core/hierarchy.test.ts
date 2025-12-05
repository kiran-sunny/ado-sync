/**
 * Tests for Hierarchy module
 */

import { describe, it, expect } from 'vitest';
import {
  flattenHierarchy,
  flattenHierarchyReverse,
  getItemsAtDepth,
  getMaxDepth,
  findItemById,
  findItemByAdoId,
  getAncestors,
  getDescendants,
  countItems,
  getValidRootTypes,
  getValidChildTypes,
  buildIdMap,
  buildAdoIdMap,
} from '../../src/core/hierarchy.js';
import {
  createMockDocument,
  createMockWorkItem,
  createMockWorkItemWithChildren,
  createMockFullHierarchyDocument,
  createMockAdoMetadata,
} from '../test-utils.js';

describe('Hierarchy Module', () => {
  describe('flattenHierarchy', () => {
    it('should flatten single item', () => {
      const doc = createMockDocument([createMockWorkItem({ id: 'pbi-001' })]);

      const result = flattenHierarchy(doc);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('pbi-001');
      expect(result[0].depth).toBe(0);
      expect(result[0].parent).toBeUndefined();
    });

    it('should flatten multiple root items', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001' }),
        createMockWorkItem({ id: 'pbi-002' }),
      ]);

      const result = flattenHierarchy(doc);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('pbi-001');
      expect(result[1].id).toBe('pbi-002');
    });

    it('should flatten nested items in parent-before-children order', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren({ id: 'pbi-001' }, [
          { id: 'task-001', type: 'Task', title: 'Task 1' },
          { id: 'task-002', type: 'Task', title: 'Task 2' },
        ]),
      ]);

      const result = flattenHierarchy(doc);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('pbi-001');
      expect(result[1].id).toBe('task-001');
      expect(result[2].id).toBe('task-002');
    });

    it('should set correct depth for nested items', () => {
      const doc = createMockFullHierarchyDocument();

      const result = flattenHierarchy(doc);

      expect(result.find(i => i.type === 'Epic')?.depth).toBe(0);
      expect(result.find(i => i.type === 'Feature')?.depth).toBe(1);
      expect(result.find(i => i.type === 'Product Backlog Item')?.depth).toBe(2);
      expect(result.find(i => i.type === 'Task')?.depth).toBe(3);
    });

    it('should set parent references correctly', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren({ id: 'pbi-001' }, [
          { id: 'task-001', type: 'Task', title: 'Task 1' },
        ]),
      ]);

      const result = flattenHierarchy(doc);

      expect(result[1].parent?.id).toBe('pbi-001');
    });

    it('should handle empty document', () => {
      const doc = {
        schemaVersion: '1.0' as const,
        hierarchyType: 'simple' as const,
        project: { organization: 'test', project: 'test' },
        workItems: [],
      };

      const result = flattenHierarchy(doc);

      expect(result).toHaveLength(0);
    });
  });

  describe('flattenHierarchyReverse', () => {
    it('should flatten children before parents', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren({ id: 'pbi-001' }, [
          { id: 'task-001', type: 'Task', title: 'Task 1' },
        ]),
      ]);

      const result = flattenHierarchyReverse(doc);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('task-001');
      expect(result[1].id).toBe('pbi-001');
    });

    it('should handle deeply nested hierarchy', () => {
      const doc = createMockFullHierarchyDocument();

      const result = flattenHierarchyReverse(doc);

      // Task should come before PBI, PBI before Feature, Feature before Epic
      const taskIndex = result.findIndex(i => i.type === 'Task');
      const pbiIndex = result.findIndex(i => i.type === 'Product Backlog Item');
      const featureIndex = result.findIndex(i => i.type === 'Feature');
      const epicIndex = result.findIndex(i => i.type === 'Epic');

      expect(taskIndex).toBeLessThan(pbiIndex);
      expect(pbiIndex).toBeLessThan(featureIndex);
      expect(featureIndex).toBeLessThan(epicIndex);
    });
  });

  describe('getItemsAtDepth', () => {
    it('should return root items at depth 0', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001' }),
        createMockWorkItem({ id: 'pbi-002' }),
      ]);

      const result = getItemsAtDepth(doc, 0);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('pbi-001');
      expect(result[1].id).toBe('pbi-002');
    });

    it('should return children at depth 1', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren({ id: 'pbi-001' }, [
          { id: 'task-001', type: 'Task', title: 'Task 1' },
          { id: 'task-002', type: 'Task', title: 'Task 2' },
        ]),
      ]);

      const result = getItemsAtDepth(doc, 1);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('task-001');
    });

    it('should return empty array for non-existent depth', () => {
      const doc = createMockDocument([createMockWorkItem({ id: 'pbi-001' })]);

      const result = getItemsAtDepth(doc, 5);

      expect(result).toHaveLength(0);
    });
  });

  describe('getMaxDepth', () => {
    it('should return 0 for flat document', () => {
      const doc = createMockDocument([createMockWorkItem()]);

      const result = getMaxDepth(doc);

      expect(result).toBe(0);
    });

    it('should return correct depth for nested document', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren({ id: 'pbi-001' }, [
          { id: 'task-001', type: 'Task', title: 'Task' },
        ]),
      ]);

      const result = getMaxDepth(doc);

      expect(result).toBe(1);
    });

    it('should return correct depth for deeply nested document', () => {
      const doc = createMockFullHierarchyDocument();

      const result = getMaxDepth(doc);

      expect(result).toBe(3); // Epic -> Feature -> PBI -> Task
    });

    it('should return 0 for empty document', () => {
      const doc = {
        schemaVersion: '1.0' as const,
        hierarchyType: 'simple' as const,
        project: { organization: 'test', project: 'test' },
        workItems: [],
      };

      const result = getMaxDepth(doc);

      expect(result).toBe(0);
    });
  });

  describe('findItemById', () => {
    it('should find item at root level', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001', title: 'Target' }),
      ]);

      const result = findItemById(doc, 'pbi-001');

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Target');
    });

    it('should find nested item', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren({ id: 'pbi-001' }, [
          { id: 'task-001', type: 'Task', title: 'Target Task' },
        ]),
      ]);

      const result = findItemById(doc, 'task-001');

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Target Task');
    });

    it('should return null for non-existent ID', () => {
      const doc = createMockDocument([createMockWorkItem({ id: 'pbi-001' })]);

      const result = findItemById(doc, 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findItemByAdoId', () => {
    it('should find item by ADO work item ID', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          _ado: createMockAdoMetadata({ workItemId: 123 }),
        }),
      ]);

      const result = findItemByAdoId(doc, 123);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('pbi-001');
    });

    it('should find nested item by ADO ID', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren(
          { id: 'pbi-001' },
          [{
            id: 'task-001',
            type: 'Task',
            title: 'Task',
            _ado: createMockAdoMetadata({ workItemId: 456 }),
          }]
        ),
      ]);

      const result = findItemByAdoId(doc, 456);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('task-001');
    });

    it('should return null for non-existent ADO ID', () => {
      const doc = createMockDocument([createMockWorkItem({ id: 'pbi-001' })]);

      const result = findItemByAdoId(doc, 999);

      expect(result).toBeNull();
    });
  });

  describe('getAncestors', () => {
    it('should return empty array for root item', () => {
      const doc = createMockDocument([createMockWorkItem({ id: 'pbi-001' })]);

      const result = getAncestors(doc, 'pbi-001');

      expect(result).toHaveLength(0);
    });

    it('should return parent for nested item', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren({ id: 'pbi-001', title: 'Parent' }, [
          { id: 'task-001', type: 'Task', title: 'Child' },
        ]),
      ]);

      const result = getAncestors(doc, 'task-001');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('pbi-001');
    });

    it('should return all ancestors for deeply nested item', () => {
      const doc = createMockFullHierarchyDocument();

      const result = getAncestors(doc, 'task-001');

      expect(result).toHaveLength(3); // Epic, Feature, PBI
      expect(result[0].type).toBe('Epic');
      expect(result[1].type).toBe('Feature');
      expect(result[2].type).toBe('Product Backlog Item');
    });

    it('should return empty array for non-existent item', () => {
      const doc = createMockDocument([createMockWorkItem({ id: 'pbi-001' })]);

      const result = getAncestors(doc, 'non-existent');

      expect(result).toHaveLength(0);
    });
  });

  describe('getDescendants', () => {
    it('should return empty array for item without children', () => {
      const item = createMockWorkItem({ id: 'pbi-001' });

      const result = getDescendants(item);

      expect(result).toHaveLength(0);
    });

    it('should return direct children', () => {
      const item = createMockWorkItemWithChildren({ id: 'pbi-001' }, [
        { id: 'task-001', type: 'Task', title: 'Task 1' },
        { id: 'task-002', type: 'Task', title: 'Task 2' },
      ]);

      const result = getDescendants(item);

      expect(result).toHaveLength(2);
    });

    it('should return all nested descendants', () => {
      const doc = createMockFullHierarchyDocument();
      const epic = doc.workItems[0];

      const result = getDescendants(epic);

      // Feature + PBI + Task
      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('countItems', () => {
    it('should count single item', () => {
      const items = [createMockWorkItem({ id: 'pbi-001' })];

      const result = countItems(items);

      expect(result).toBe(1);
    });

    it('should count multiple items', () => {
      const items = [
        createMockWorkItem({ id: 'pbi-001' }),
        createMockWorkItem({ id: 'pbi-002' }),
        createMockWorkItem({ id: 'pbi-003' }),
      ];

      const result = countItems(items);

      expect(result).toBe(3);
    });

    it('should count nested items', () => {
      const items = [
        createMockWorkItemWithChildren({ id: 'pbi-001' }, [
          { id: 'task-001', type: 'Task', title: 'Task 1' },
          { id: 'task-002', type: 'Task', title: 'Task 2' },
        ]),
      ];

      const result = countItems(items);

      expect(result).toBe(3);
    });

    it('should return 0 for empty array', () => {
      const result = countItems([]);

      expect(result).toBe(0);
    });
  });

  describe('getValidRootTypes', () => {
    it('should return Epic for full hierarchy', () => {
      const result = getValidRootTypes('full');

      expect(result).toEqual(['Epic']);
    });

    it('should return Feature for medium hierarchy', () => {
      const result = getValidRootTypes('medium');

      expect(result).toEqual(['Feature']);
    });

    it('should return PBI types for simple hierarchy', () => {
      const result = getValidRootTypes('simple');

      expect(result).toContain('Product Backlog Item');
      expect(result).toContain('User Story');
      expect(result).toContain('Bug');
    });
  });

  describe('getValidChildTypes', () => {
    it('should return Feature for Epic', () => {
      const result = getValidChildTypes('Epic');

      expect(result).toEqual(['Feature']);
    });

    it('should return PBI types for Feature', () => {
      const result = getValidChildTypes('Feature');

      expect(result).toContain('Product Backlog Item');
      expect(result).toContain('User Story');
      expect(result).toContain('Bug');
    });

    it('should return Task for Product Backlog Item', () => {
      const result = getValidChildTypes('Product Backlog Item');

      expect(result).toEqual(['Task']);
    });

    it('should return empty array for Task', () => {
      const result = getValidChildTypes('Task');

      expect(result).toEqual([]);
    });

    it('should return empty array for unknown type', () => {
      const result = getValidChildTypes('UnknownType');

      expect(result).toEqual([]);
    });
  });

  describe('buildIdMap', () => {
    it('should build map of all items by local ID', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001' }),
        createMockWorkItem({ id: 'pbi-002' }),
      ]);

      const map = buildIdMap(doc);

      expect(map.size).toBe(2);
      expect(map.get('pbi-001')).toBeDefined();
      expect(map.get('pbi-002')).toBeDefined();
    });

    it('should include nested items in map', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren({ id: 'pbi-001' }, [
          { id: 'task-001', type: 'Task', title: 'Task' },
        ]),
      ]);

      const map = buildIdMap(doc);

      expect(map.size).toBe(2);
      expect(map.get('pbi-001')).toBeDefined();
      expect(map.get('task-001')).toBeDefined();
    });
  });

  describe('buildAdoIdMap', () => {
    it('should build map of items by ADO ID', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          _ado: createMockAdoMetadata({ workItemId: 123 }),
        }),
        createMockWorkItem({
          id: 'pbi-002',
          _ado: createMockAdoMetadata({ workItemId: 456 }),
        }),
      ]);

      const map = buildAdoIdMap(doc);

      expect(map.size).toBe(2);
      expect(map.get(123)?.id).toBe('pbi-001');
      expect(map.get(456)?.id).toBe('pbi-002');
    });

    it('should skip items without ADO metadata', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001' }), // No _ado
        createMockWorkItem({
          id: 'pbi-002',
          _ado: createMockAdoMetadata({ workItemId: 456 }),
        }),
      ]);

      const map = buildAdoIdMap(doc);

      expect(map.size).toBe(1);
      expect(map.get(456)?.id).toBe('pbi-002');
    });

    it('should include nested items with ADO metadata', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren(
          {
            id: 'pbi-001',
            _ado: createMockAdoMetadata({ workItemId: 123 }),
          },
          [{
            id: 'task-001',
            type: 'Task',
            title: 'Task',
            _ado: createMockAdoMetadata({ workItemId: 456 }),
          }]
        ),
      ]);

      const map = buildAdoIdMap(doc);

      expect(map.size).toBe(2);
      expect(map.get(123)?.id).toBe('pbi-001');
      expect(map.get(456)?.id).toBe('task-001');
    });
  });
});
