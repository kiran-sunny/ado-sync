/**
 * Tests for Diff Engine module
 */

import { describe, it, expect } from 'vitest';
import {
  diffWorkItem,
  diffDocument,
  hasLocalChanges,
  getDiffSummary,
  formatFieldChange,
} from '../../src/core/diff-engine.js';
import {
  createMockWorkItem,
  createMockDocument,
  createMockAdoResponse,
  createMockAdoMetadata,
  createMockWorkItemWithChildren,
} from '../test-utils.js';
import type { AdoWorkItemResponse } from '../../src/types/ado-api.js';

describe('Diff Engine', () => {
  describe('diffWorkItem', () => {
    describe('new items', () => {
      it('should mark item as new when ADO response is null', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'New Item',
        });

        const result = diffWorkItem(local, null);

        expect(result.status).toBe('new');
        expect(result.localId).toBe('pbi-001');
        expect(result.adoId).toBeUndefined();
      });

      it('should include all defined fields in changes for new item', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'New Item',
          description: 'Description',
          priority: 2,
          effort: 5,
        });

        const result = diffWorkItem(local, null);

        expect(result.changes.some(c => c.field === 'title')).toBe(true);
        expect(result.changes.some(c => c.field === 'description')).toBe(true);
        expect(result.changes.some(c => c.field === 'priority')).toBe(true);
        expect(result.changes.some(c => c.field === 'effort')).toBe(true);
      });
    });

    describe('unchanged items', () => {
      it('should mark item as unchanged when values match', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'Test Item',
          state: 'New',
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        });

        const ado = createMockAdoResponse({
          id: 123,
          rev: 1,
          fields: {
            'System.Title': 'Test Item',
            'System.State': 'New',
            'System.WorkItemType': 'Product Backlog Item',
          },
        });

        const result = diffWorkItem(local, ado);

        expect(result.status).toBe('unchanged');
        expect(result.changes).toHaveLength(0);
      });

      it('should ignore whitespace differences in strings', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'Test Item ',  // Trailing space
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        });

        const ado = createMockAdoResponse({
          id: 123,
          rev: 1,
          fields: {
            'System.Title': 'Test Item',
            'System.WorkItemType': 'Product Backlog Item',
          },
        });

        const result = diffWorkItem(local, ado);

        expect(result.changes.filter(c => c.field === 'title')).toHaveLength(0);
      });
    });

    describe('modified items', () => {
      it('should detect title change', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'Updated Title',
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        });

        const ado = createMockAdoResponse({
          id: 123,
          rev: 1,
          fields: {
            'System.Title': 'Original Title',
            'System.WorkItemType': 'Product Backlog Item',
          },
        });

        const result = diffWorkItem(local, ado);

        expect(result.status).toBe('modified');
        expect(result.changes.some(c => c.field === 'title')).toBe(true);
        const titleChange = result.changes.find(c => c.field === 'title');
        expect(titleChange?.localValue).toBe('Updated Title');
        expect(titleChange?.adoValue).toBe('Original Title');
      });

      it('should detect state change', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'Test',
          state: 'Active',
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        });

        const ado = createMockAdoResponse({
          id: 123,
          rev: 1,
          fields: {
            'System.Title': 'Test',
            'System.State': 'New',
            'System.WorkItemType': 'Product Backlog Item',
          },
        });

        const result = diffWorkItem(local, ado);

        expect(result.status).toBe('modified');
        expect(result.changes.some(c => c.field === 'state')).toBe(true);
      });

      it('should detect priority change', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'Test',
          priority: 1,
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        });

        const ado = createMockAdoResponse({
          id: 123,
          rev: 1,
          fields: {
            'System.Title': 'Test',
            'Microsoft.VSTS.Common.Priority': 2,
            'System.WorkItemType': 'Product Backlog Item',
          },
        });

        const result = diffWorkItem(local, ado);

        expect(result.status).toBe('modified');
        expect(result.changes.some(c => c.field === 'priority')).toBe(true);
      });

      it('should detect effort change', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'Test',
          effort: 8,
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        });

        const ado = createMockAdoResponse({
          id: 123,
          rev: 1,
          fields: {
            'System.Title': 'Test',
            'Microsoft.VSTS.Scheduling.Effort': 5,
            'System.WorkItemType': 'Product Backlog Item',
          },
        });

        const result = diffWorkItem(local, ado);

        expect(result.changes.some(c => c.field === 'effort')).toBe(true);
      });

      it('should detect multiple changes', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'New Title',
          description: 'New Description',
          state: 'Active',
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        });

        const ado = createMockAdoResponse({
          id: 123,
          rev: 1,
          fields: {
            'System.Title': 'Old Title',
            'System.Description': 'Old Description',
            'System.State': 'New',
            'System.WorkItemType': 'Product Backlog Item',
          },
        });

        const result = diffWorkItem(local, ado);

        expect(result.status).toBe('modified');
        expect(result.changes.length).toBeGreaterThanOrEqual(3);
      });
    });

    describe('tags comparison', () => {
      it('should detect added tags', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'Test',
          tags: ['tag1', 'tag2', 'tag3'],
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        });

        const ado = createMockAdoResponse({
          id: 123,
          rev: 1,
          fields: {
            'System.Title': 'Test',
            'System.Tags': 'tag1; tag2',
            'System.WorkItemType': 'Product Backlog Item',
          },
        });

        const result = diffWorkItem(local, ado);

        expect(result.changes.some(c => c.field === 'tags')).toBe(true);
      });

      it('should not detect difference when tags are same but in different order', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'Test',
          tags: ['tag2', 'tag1'],
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        });

        const ado = createMockAdoResponse({
          id: 123,
          rev: 1,
          fields: {
            'System.Title': 'Test',
            'System.Tags': 'tag1; tag2',
            'System.WorkItemType': 'Product Backlog Item',
          },
        });

        const result = diffWorkItem(local, ado);

        expect(result.changes.filter(c => c.field === 'tags')).toHaveLength(0);
      });
    });

    describe('conflict detection', () => {
      it('should detect conflict when ADO has newer revision', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'Local Change',
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        });

        const ado = createMockAdoResponse({
          id: 123,
          rev: 3,  // Newer revision
          fields: {
            'System.Title': 'ADO Change',
            'System.WorkItemType': 'Product Backlog Item',
          },
        });

        const result = diffWorkItem(local, ado);

        expect(result.status).toBe('conflict');
      });

      it('should not detect conflict when revisions match', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'Local Change',
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 2 }),
        });

        const ado = createMockAdoResponse({
          id: 123,
          rev: 2,
          fields: {
            'System.Title': 'Different Title',
            'System.WorkItemType': 'Product Backlog Item',
          },
        });

        const result = diffWorkItem(local, ado);

        expect(result.status).toBe('modified'); // Not conflict
      });
    });

    describe('assignedTo field', () => {
      it('should extract displayName from ADO assignedTo', () => {
        const local = createMockWorkItem({
          id: 'pbi-001',
          title: 'Test',
          assignedTo: 'John Doe',
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        });

        const ado = createMockAdoResponse({
          id: 123,
          rev: 1,
          fields: {
            'System.Title': 'Test',
            'System.AssignedTo': {
              displayName: 'John Doe',
              uniqueName: 'john@example.com',
            },
            'System.WorkItemType': 'Product Backlog Item',
          },
        });

        const result = diffWorkItem(local, ado);

        expect(result.changes.filter(c => c.field === 'assignedTo')).toHaveLength(0);
      });
    });
  });

  describe('diffDocument', () => {
    it('should diff all items in document', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          title: 'Item 1',
          state: 'New',
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        }),
        createMockWorkItem({
          id: 'pbi-002',
          title: 'Item 2',
        }),  // No ADO ID - new item
      ]);

      const adoItems = new Map<number, AdoWorkItemResponse>([
        [123, createMockAdoResponse({
          id: 123,
          rev: 1,
          fields: {
            'System.Title': 'Item 1',
            'System.State': 'New',
            'System.WorkItemType': 'Product Backlog Item',
          },
        })],
      ]);

      const result = diffDocument(doc, adoItems);

      expect(result).toHaveLength(2);
      expect(result.find(d => d.localId === 'pbi-001')?.status).toBe('unchanged');
      expect(result.find(d => d.localId === 'pbi-002')?.status).toBe('new');
    });

    it('should diff nested items', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren(
          {
            id: 'pbi-001',
            _ado: createMockAdoMetadata({ workItemId: 123 }),
          },
          [{
            id: 'task-001',
            type: 'Task',
            title: 'Task 1',
          }]
        ),
      ]);

      const adoItems = new Map<number, AdoWorkItemResponse>([
        [123, createMockAdoResponse({ id: 123 })],
      ]);

      const result = diffDocument(doc, adoItems);

      expect(result).toHaveLength(2);
      expect(result.find(d => d.localId === 'task-001')?.status).toBe('new');
    });
  });

  describe('hasLocalChanges', () => {
    it('should return true when there are changes', () => {
      const local = createMockWorkItem({
        id: 'pbi-001',
        title: 'Changed Title',
      });

      const ado = createMockAdoResponse({
        id: 123,
        fields: {
          'System.Title': 'Original Title',
          'System.WorkItemType': 'Product Backlog Item',
        },
      });

      const result = hasLocalChanges(local, ado);

      expect(result).toBe(true);
    });

    it('should return false when there are no changes', () => {
      const local = createMockWorkItem({
        id: 'pbi-001',
        title: 'Same Title',
        state: 'New',
      });

      const ado = createMockAdoResponse({
        id: 123,
        fields: {
          'System.Title': 'Same Title',
          'System.State': 'New',
          'System.WorkItemType': 'Product Backlog Item',
        },
      });

      const result = hasLocalChanges(local, ado);

      expect(result).toBe(false);
    });
  });

  describe('getDiffSummary', () => {
    it('should count items by status', () => {
      const diffs = [
        { localId: 'pbi-001', status: 'new' as const, changes: [] },
        { localId: 'pbi-002', status: 'new' as const, changes: [] },
        { localId: 'pbi-003', status: 'modified' as const, adoId: 1, changes: [] },
        { localId: 'pbi-004', status: 'unchanged' as const, adoId: 2, changes: [] },
        { localId: 'pbi-005', status: 'conflict' as const, adoId: 3, changes: [] },
      ];

      const result = getDiffSummary(diffs);

      expect(result.new).toBe(2);
      expect(result.modified).toBe(1);
      expect(result.unchanged).toBe(1);
      expect(result.conflict).toBe(1);
      expect(result.deleted).toBe(0);
    });

    it('should return all zeros for empty diffs', () => {
      const result = getDiffSummary([]);

      expect(result.new).toBe(0);
      expect(result.modified).toBe(0);
      expect(result.unchanged).toBe(0);
      expect(result.conflict).toBe(0);
      expect(result.deleted).toBe(0);
    });
  });

  describe('formatFieldChange', () => {
    it('should format field change with values', () => {
      const change = {
        field: 'title',
        localValue: 'New Title',
        adoValue: 'Old Title',
      };

      const result = formatFieldChange(change);

      expect(result).toContain('title');
      expect(result).toContain('New Title');
      expect(result).toContain('Old Title');
    });

    it('should handle undefined values', () => {
      const change = {
        field: 'description',
        localValue: 'New Description',
        adoValue: undefined,
      };

      const result = formatFieldChange(change);

      expect(result).toContain('(empty)');
    });

    it('should handle array values', () => {
      const change = {
        field: 'tags',
        localValue: ['tag1', 'tag2'],
        adoValue: ['tag3'],
      };

      const result = formatFieldChange(change);

      expect(result).toContain('tag1, tag2');
      expect(result).toContain('tag3');
    });

    it('should truncate long strings', () => {
      const change = {
        field: 'description',
        localValue: 'a'.repeat(100),
        adoValue: 'Short',
      };

      const result = formatFieldChange(change);

      expect(result).toContain('...');
      expect(result.length).toBeLessThan(200);
    });
  });
});
