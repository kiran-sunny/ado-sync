/**
 * Tests for YAML Writer module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  writeYamlFile,
  serializeYaml,
  updateWorkItemAdoMetadata,
  backupYamlFile,
} from '../../src/yaml/writer.js';
import {
  createMockDocument,
  createMockWorkItem,
  createMockWorkItemWithChildren,
  createMockAdoMetadata,
  createMockFullHierarchyDocument,
} from '../test-utils.js';

describe('YAML Writer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('serializeYaml', () => {
    it('should serialize simple document to YAML', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001', title: 'Test PBI' }),
      ]);

      const result = serializeYaml(doc);

      expect(result).toContain('schemaVersion: "1.0"');
      expect(result).toContain('hierarchyType: simple');
      expect(result).toContain('organization: test-org');
      expect(result).toContain('project: test-project');
      expect(result).toContain('id: pbi-001');
      expect(result).toContain('title: Test PBI');
    });

    it('should serialize document with nested children', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren({ id: 'pbi-001', title: 'Parent' }, [
          { id: 'task-001', type: 'Task', title: 'Child Task' },
        ]),
      ]);

      const result = serializeYaml(doc);

      expect(result).toContain('id: pbi-001');
      expect(result).toContain('children:');
      expect(result).toContain('id: task-001');
      expect(result).toContain('title: Child Task');
    });

    it('should serialize document with ADO metadata', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          _ado: createMockAdoMetadata({
            workItemId: 123,
            rev: 5,
            lastSyncedAt: '2025-01-15T10:00:00Z',
          }),
        }),
      ]);

      const result = serializeYaml(doc);

      expect(result).toContain('_ado:');
      expect(result).toContain('workItemId: 123');
      expect(result).toContain('rev: 5');
      expect(result).toContain('lastSyncedAt:');
    });

    it('should omit undefined fields', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          title: 'Test',
          description: undefined,
          priority: undefined,
        }),
      ]);

      const result = serializeYaml(doc);

      expect(result).toContain('id: pbi-001');
      expect(result).not.toContain('description:');
      expect(result).not.toContain('priority:');
    });

    it('should serialize tags array', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          tags: ['tag1', 'tag2', 'Q1-2025'],
        }),
      ]);

      const result = serializeYaml(doc);

      expect(result).toContain('tags:');
      expect(result).toContain('- tag1');
      expect(result).toContain('- tag2');
      expect(result).toContain('- Q1-2025');
    });

    it('should omit empty tags array', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          tags: [],
        }),
      ]);

      const result = serializeYaml(doc);

      expect(result).not.toContain('tags:');
    });

    it('should serialize full hierarchy document', () => {
      const doc = createMockFullHierarchyDocument();

      const result = serializeYaml(doc);

      expect(result).toContain('hierarchyType: full');
      expect(result).toContain('type: Epic');
      expect(result).toContain('type: Feature');
      expect(result).toContain('type: Product Backlog Item');
      expect(result).toContain('type: Task');
    });

    it('should preserve areaPath and iterationPath in project config', () => {
      const doc = createMockDocument([], {
        project: {
          organization: 'test-org',
          project: 'test-project',
          areaPath: 'test-project\\Team1',
          iterationPath: 'test-project\\Sprint 1',
        },
      });
      doc.workItems = [createMockWorkItem()];

      const result = serializeYaml(doc);

      expect(result).toContain('areaPath: test-project\\Team1');
      expect(result).toContain('iterationPath: test-project\\Sprint 1');
    });

    it('should serialize numeric fields correctly', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          priority: 2,
          effort: 8,
          storyPoints: 5,
        }),
      ]);

      const result = serializeYaml(doc);

      expect(result).toContain('priority: 2');
      expect(result).toContain('effort: 8');
      expect(result).toContain('storyPoints: 5');
    });

    it('should serialize Task-specific fields', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          type: 'Task',
          id: 'task-001',
          title: 'Test Task',
          activity: 'Development',
          remainingWork: 4,
          originalEstimate: 8,
          completedWork: 2,
        }),
      ]);

      const result = serializeYaml(doc);

      expect(result).toContain('activity: Development');
      expect(result).toContain('remainingWork: 4');
      expect(result).toContain('originalEstimate: 8');
      expect(result).toContain('completedWork: 2');
    });

    it('should serialize Epic/Feature-specific fields', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          type: 'Epic',
          id: 'epic-001',
          title: 'Test Epic',
          valueArea: 'Business',
          businessValue: 100,
          targetDate: '2025-06-30',
        }),
      ]);

      const result = serializeYaml(doc);

      expect(result).toContain('valueArea: Business');
      expect(result).toContain('businessValue: 100');
      expect(result).toContain('targetDate:');
    });
  });

  describe('writeYamlFile', () => {
    it('should write serialized YAML to file', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001' }),
      ]);

      await writeYamlFile('/path/to/output.yaml', doc);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/path/to/output.yaml',
        expect.stringContaining('schemaVersion'),
        'utf-8'
      );
    });

    it('should throw error on write failure', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('EACCES: permission denied'));

      const doc = createMockDocument();

      await expect(writeYamlFile('/protected/output.yaml', doc))
        .rejects.toThrow('EACCES');
    });

    it('should throw error when disk is full', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('ENOSPC: no space left on device'));

      const doc = createMockDocument();

      await expect(writeYamlFile('/output.yaml', doc))
        .rejects.toThrow('ENOSPC');
    });
  });

  describe('updateWorkItemAdoMetadata', () => {
    it('should update ADO metadata for root-level item', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001' }),
      ]);

      const result = updateWorkItemAdoMetadata(doc, 'pbi-001', {
        workItemId: 123,
        url: 'https://dev.azure.com/test/test/_workitems/edit/123',
        rev: 1,
        lastSyncedAt: '2025-01-15T10:00:00Z',
      });

      expect(result).toBe(true);
      expect(doc.workItems[0]._ado?.workItemId).toBe(123);
      expect(doc.workItems[0]._ado?.rev).toBe(1);
    });

    it('should update ADO metadata for nested item', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren({ id: 'pbi-001' }, [
          { id: 'task-001', type: 'Task', title: 'Task' },
        ]),
      ]);

      const result = updateWorkItemAdoMetadata(doc, 'task-001', {
        workItemId: 456,
        url: 'https://dev.azure.com/test/test/_workitems/edit/456',
        rev: 2,
        lastSyncedAt: '2025-01-15T11:00:00Z',
      });

      expect(result).toBe(true);
      expect(doc.workItems[0].children![0]._ado?.workItemId).toBe(456);
    });

    it('should update deeply nested item', () => {
      const doc = createMockDocument([
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
                    { type: 'Task', id: 'task-deep', title: 'Deep Task' },
                  ],
                },
              ],
            },
          ],
        },
      ]);

      const result = updateWorkItemAdoMetadata(doc, 'task-deep', {
        workItemId: 789,
        url: 'https://dev.azure.com/test/test/_workitems/edit/789',
        rev: 3,
        lastSyncedAt: '2025-01-15T12:00:00Z',
      });

      expect(result).toBe(true);
      const deepTask = doc.workItems[0].children![0].children![0].children![0];
      expect(deepTask._ado?.workItemId).toBe(789);
    });

    it('should return false for non-existent item', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001' }),
      ]);

      const result = updateWorkItemAdoMetadata(doc, 'non-existent', {
        workItemId: 123,
        url: '',
        rev: 1,
        lastSyncedAt: '',
      });

      expect(result).toBe(false);
    });

    it('should merge with existing ADO metadata', () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          _ado: {
            workItemId: 123,
            url: 'old-url',
            rev: 1,
            lastSyncedAt: 'old-date',
            state: 'New',
          },
        }),
      ]);

      const result = updateWorkItemAdoMetadata(doc, 'pbi-001', {
        rev: 2,
        lastSyncedAt: '2025-01-15T10:00:00Z',
        state: 'Active',
      });

      expect(result).toBe(true);
      expect(doc.workItems[0]._ado?.workItemId).toBe(123); // Preserved
      expect(doc.workItems[0]._ado?.rev).toBe(2); // Updated
      expect(doc.workItems[0]._ado?.state).toBe('Active'); // Updated
    });

    it('should create new ADO metadata if none exists', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001' }),
      ]);

      expect(doc.workItems[0]._ado).toBeUndefined();

      const result = updateWorkItemAdoMetadata(doc, 'pbi-001', {
        workItemId: 123,
        url: 'test-url',
        rev: 1,
        lastSyncedAt: 'test-date',
      });

      expect(result).toBe(true);
      expect(doc.workItems[0]._ado).toBeDefined();
      expect(doc.workItems[0]._ado?.workItemId).toBe(123);
    });
  });

  describe('backupYamlFile', () => {
    it('should create backup with timestamp', async () => {
      const mockNow = 1705320000000; // Fixed timestamp
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

      const backupPath = await backupYamlFile('/path/to/file.yaml');

      expect(fs.copyFile).toHaveBeenCalledWith(
        '/path/to/file.yaml',
        `/path/to/file.yaml.backup.${mockNow}`
      );
      expect(backupPath).toBe(`/path/to/file.yaml.backup.${mockNow}`);
    });

    it('should throw error if source file does not exist', async () => {
      vi.mocked(fs.copyFile).mockRejectedValue(new Error('ENOENT: no such file'));

      await expect(backupYamlFile('/nonexistent.yaml'))
        .rejects.toThrow('ENOENT');
    });

    it('should throw error on copy failure', async () => {
      vi.mocked(fs.copyFile).mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(backupYamlFile('/protected/file.yaml'))
        .rejects.toThrow('EACCES');
    });
  });
});
