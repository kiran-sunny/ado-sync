/**
 * Tests for YAML Validator module
 */

import { describe, it, expect } from 'vitest';
import {
  validateDocument,
  validateAdoConsistency,
  isValidDocument,
  WorkItemsDocumentSchema,
  WorkItemSchema,
} from '../../src/yaml/validator.js';
import {
  createMockDocument,
  createMockWorkItem,
  createMockWorkItemWithChildren,
  createMockFullHierarchyDocument,
  createMockAdoMetadata,
} from '../test-utils.js';

describe('YAML Validator', () => {
  describe('validateDocument', () => {
    describe('valid documents', () => {
      it('should validate simple hierarchy document', () => {
        const doc = createMockDocument([
          createMockWorkItem({
            type: 'Product Backlog Item',
            id: 'pbi-001',
            title: 'Valid PBI',
          }),
        ], {
          hierarchyType: 'simple',
        });

        const result = validateDocument(doc);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate full hierarchy document', () => {
        const doc = createMockFullHierarchyDocument();

        const result = validateDocument(doc);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate document with all optional fields', () => {
        const doc = createMockDocument([
          createMockWorkItem({
            type: 'Product Backlog Item',
            id: 'pbi-001',
            title: 'Full PBI',
            description: 'Test description',
            state: 'New',
            priority: 2,
            tags: ['tag1', 'tag2'],
            assignedTo: 'user@example.com',
            effort: 8,
            acceptanceCriteria: '- [ ] Test criteria',
          }),
        ], {
          hierarchyType: 'simple',
        });

        const result = validateDocument(doc);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate document with ADO metadata', () => {
        const doc = createMockDocument([
          createMockWorkItem({
            id: 'pbi-001',
            _ado: createMockAdoMetadata(),
          }),
        ], {
          hierarchyType: 'simple',
        });

        const result = validateDocument(doc);

        expect(result.valid).toBe(true);
      });
    });

    describe('schema validation errors', () => {
      it('should reject invalid schema version', () => {
        const doc = {
          schemaVersion: '2.0', // Invalid
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [{ type: 'Product Backlog Item', id: 'pbi-001', title: 'Test' }],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('schemaVersion'))).toBe(true);
      });

      it('should reject invalid hierarchy type', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'invalid',
          project: { organization: 'test', project: 'test' },
          workItems: [{ type: 'Product Backlog Item', id: 'pbi-001', title: 'Test' }],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('hierarchyType'))).toBe(true);
      });

      it('should reject missing required project organization', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { project: 'test' }, // Missing organization
          workItems: [{ type: 'Product Backlog Item', id: 'pbi-001', title: 'Test' }],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.toLowerCase().includes('required'))).toBe(true);
      });

      it('should reject missing required project name', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test' }, // Missing project
          workItems: [{ type: 'Product Backlog Item', id: 'pbi-001', title: 'Test' }],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
      });

      it('should reject empty workItems array', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
      });

      it('should reject invalid work item type', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [{ type: 'InvalidType', id: 'pbi-001', title: 'Test' }],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('type'))).toBe(true);
      });

      it('should reject empty work item ID', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [{ type: 'Product Backlog Item', id: '', title: 'Test' }],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('id'))).toBe(true);
      });

      it('should reject work item ID with invalid characters', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [{ type: 'Product Backlog Item', id: 'pbi 001 invalid!', title: 'Test' }],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
      });

      it('should reject empty work item title', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [{ type: 'Product Backlog Item', id: 'pbi-001', title: '' }],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('title'))).toBe(true);
      });

      it('should reject title exceeding max length', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [{ type: 'Product Backlog Item', id: 'pbi-001', title: 'a'.repeat(256) }],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
      });

      it('should reject invalid priority value', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [{ type: 'Product Backlog Item', id: 'pbi-001', title: 'Test', priority: 5 }],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('priority'))).toBe(true);
      });

      it('should reject invalid activity value', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [{ type: 'Task', id: 'task-001', title: 'Test', activity: 'InvalidActivity' }],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
      });

      it('should reject negative effort value', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [{ type: 'Product Backlog Item', id: 'pbi-001', title: 'Test', effort: -5 }],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
      });
    });

    describe('duplicate ID validation', () => {
      it('should reject duplicate IDs at root level', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [
            { type: 'Product Backlog Item', id: 'pbi-001', title: 'First' },
            { type: 'Product Backlog Item', id: 'pbi-001', title: 'Second' }, // Duplicate
          ],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'DUPLICATE_ID')).toBe(true);
      });

      it('should reject duplicate IDs in children', () => {
        const doc = createMockDocument([
          createMockWorkItemWithChildren({ id: 'pbi-001' }, [
            { id: 'task-001', type: 'Task', title: 'Task 1' },
            { id: 'task-001', type: 'Task', title: 'Task 2' }, // Duplicate
          ]),
        ], {
          hierarchyType: 'simple',
        });

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'DUPLICATE_ID')).toBe(true);
      });

      it('should reject duplicate IDs across parent and child', () => {
        const doc = createMockDocument([
          createMockWorkItemWithChildren({ id: 'item-001' }, [
            { id: 'item-001', type: 'Task', title: 'Duplicate ID' }, // Same as parent
          ]),
        ], {
          hierarchyType: 'simple',
        });

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'DUPLICATE_ID')).toBe(true);
      });
    });

    describe('hierarchy type validation', () => {
      it('should reject Epic in simple hierarchy', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [
            { type: 'Epic', id: 'epic-001', title: 'Invalid Epic' },
          ],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'INVALID_HIERARCHY_TYPE')).toBe(true);
      });

      it('should reject Feature in simple hierarchy', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [
            { type: 'Feature', id: 'feat-001', title: 'Invalid Feature' },
          ],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === 'INVALID_HIERARCHY_TYPE')).toBe(true);
      });

      it('should reject PBI as child of Task', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [
            {
              type: 'Product Backlog Item',
              id: 'pbi-001',
              title: 'PBI',
              children: [
                {
                  type: 'Task',
                  id: 'task-001',
                  title: 'Task',
                  children: [
                    { type: 'Product Backlog Item', id: 'pbi-002', title: 'Invalid child PBI' },
                  ],
                },
              ],
            },
          ],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(false);
      });

      it('should accept valid full hierarchy', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'full',
          project: { organization: 'test', project: 'test' },
          workItems: [
            {
              type: 'Epic',
              id: 'epic-001',
              title: 'Epic',
              children: [
                {
                  type: 'Feature',
                  id: 'feat-001',
                  title: 'Feature',
                  children: [
                    {
                      type: 'Product Backlog Item',
                      id: 'pbi-001',
                      title: 'PBI',
                      children: [
                        { type: 'Task', id: 'task-001', title: 'Task' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(true);
      });

      it('should accept valid medium hierarchy', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'medium',
          project: { organization: 'test', project: 'test' },
          workItems: [
            {
              type: 'Feature',
              id: 'feat-001',
              title: 'Feature',
              children: [
                {
                  type: 'Product Backlog Item',
                  id: 'pbi-001',
                  title: 'PBI',
                  children: [
                    { type: 'Task', id: 'task-001', title: 'Task' },
                  ],
                },
              ],
            },
          ],
        };

        const result = validateDocument(doc);

        expect(result.valid).toBe(true);
      });
    });

    describe('warnings', () => {
      it('should warn about Task with children', () => {
        const doc = {
          schemaVersion: '1.0',
          hierarchyType: 'simple',
          project: { organization: 'test', project: 'test' },
          workItems: [
            {
              type: 'Product Backlog Item',
              id: 'pbi-001',
              title: 'PBI',
              children: [
                {
                  type: 'Task',
                  id: 'task-001',
                  title: 'Task with children',
                  children: [
                    { type: 'Task', id: 'subtask-001', title: 'Subtask' },
                  ],
                },
              ],
            },
          ],
        };

        const result = validateDocument(doc);

        expect(result.warnings.some(w => w.code === 'TASK_WITH_CHILDREN')).toBe(true);
      });
    });
  });

  describe('validateAdoConsistency', () => {
    it('should return no warnings for consistent document', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          _ado: createMockAdoMetadata({
            workItemId: 123,
            rev: 1,
          }),
        }),
      ], {
        hierarchyType: 'simple',
      });

      const warnings = validateAdoConsistency(doc);

      expect(warnings).toHaveLength(0);
    });

    it('should warn about missing revision number', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          _ado: {
            workItemId: 123,
            url: 'test-url',
            rev: null, // Missing rev
            lastSyncedAt: null,
          },
        }),
      ], {
        hierarchyType: 'simple',
      });

      const warnings = validateAdoConsistency(doc);

      expect(warnings.some(w => w.code === 'MISSING_REV')).toBe(true);
    });

    it('should check nested items for ADO consistency', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren(
          {
            id: 'pbi-001',
            _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
          },
          [
            {
              id: 'task-001',
              type: 'Task',
              title: 'Task',
              _ado: {
                workItemId: 456,
                url: 'test-url',
                rev: null, // Missing rev
                lastSyncedAt: null,
              },
            },
          ]
        ),
      ], {
        hierarchyType: 'simple',
      });

      const warnings = validateAdoConsistency(doc);

      expect(warnings.some(w => w.code === 'MISSING_REV')).toBe(true);
    });
  });

  describe('isValidDocument', () => {
    it('should return true for valid document', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          type: 'Product Backlog Item',
          id: 'pbi-001',
          title: 'Valid',
        }),
      ], {
        hierarchyType: 'simple',
      });

      expect(isValidDocument(doc)).toBe(true);
    });

    it('should return false for invalid document', () => {
      const doc = {
        schemaVersion: 'invalid',
        hierarchyType: 'simple',
        project: { organization: 'test', project: 'test' },
        workItems: [],
      };

      expect(isValidDocument(doc)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidDocument(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidDocument(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isValidDocument('string')).toBe(false);
      expect(isValidDocument(123)).toBe(false);
      expect(isValidDocument([])).toBe(false);
    });
  });

  describe('WorkItemSchema', () => {
    it('should validate minimal work item', () => {
      const item = {
        type: 'Product Backlog Item',
        id: 'pbi-001',
        title: 'Test',
      };

      const result = WorkItemSchema.safeParse(item);

      expect(result.success).toBe(true);
    });

    it('should validate work item with all valid types', () => {
      const types = ['Epic', 'Feature', 'Product Backlog Item', 'User Story', 'Task', 'Bug', 'Issue'];

      for (const type of types) {
        const item = { type, id: 'test-001', title: 'Test' };
        const result = WorkItemSchema.safeParse(item);
        expect(result.success).toBe(true);
      }
    });

    it('should validate work item ID patterns', () => {
      const validIds = ['pbi-001', 'task_123', 'FEATURE-A', 'simple'];

      for (const id of validIds) {
        const item = { type: 'Task', id, title: 'Test' };
        const result = WorkItemSchema.safeParse(item);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid work item ID patterns', () => {
      const invalidIds = ['pbi 001', 'task!123', 'item@test'];

      for (const id of invalidIds) {
        const item = { type: 'Task', id, title: 'Test' };
        const result = WorkItemSchema.safeParse(item);
        expect(result.success).toBe(false);
      }
    });
  });
});
