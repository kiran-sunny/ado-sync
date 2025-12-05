/**
 * Tests for YAML Parser module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  parseYamlFile,
  parseYaml,
  parseYamlFileWithTypes,
  parseYamlWithTypes,
  fileExists,
  getAllLocalIds,
  findWorkItemById,
  countWorkItems,
} from '../../src/yaml/parser.js';
import {
  createMockDocument,
  createMockWorkItem,
  createMockWorkItemWithChildren,
  generateValidYaml,
} from '../test-utils.js';

describe('YAML Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseYaml', () => {
    it('should parse valid YAML string into WorkItemsDocument', () => {
      const yaml = `
schemaVersion: "1.0"
hierarchyType: "simple"
project:
  organization: "test-org"
  project: "test-project"
workItems:
  - type: "Product Backlog Item"
    id: "pbi-001"
    title: "Test PBI"
    state: "New"
`;

      const result = parseYaml(yaml);

      expect(result.schemaVersion).toBe('1.0');
      expect(result.hierarchyType).toBe('simple');
      expect(result.project.organization).toBe('test-org');
      expect(result.project.project).toBe('test-project');
      expect(result.workItems).toHaveLength(1);
      expect(result.workItems[0].id).toBe('pbi-001');
    });

    it('should throw error for empty YAML', () => {
      expect(() => parseYaml('')).toThrow('Empty YAML document');
    });

    it('should throw error for null YAML content', () => {
      expect(() => parseYaml('null')).toThrow('Empty YAML document');
    });

    it('should throw error for malformed YAML', () => {
      const invalidYaml = `
schemaVersion: "1.0"
  invalid indentation
    more invalid
`;
      expect(() => parseYaml(invalidYaml)).toThrow();
    });

    it('should parse YAML with nested children', () => {
      const yaml = `
schemaVersion: "1.0"
hierarchyType: "simple"
project:
  organization: "test-org"
  project: "test-project"
workItems:
  - type: "Product Backlog Item"
    id: "pbi-001"
    title: "Test PBI"
    children:
      - type: "Task"
        id: "task-001"
        title: "Test Task"
`;

      const result = parseYaml(yaml);

      expect(result.workItems[0].children).toHaveLength(1);
      expect(result.workItems[0].children![0].id).toBe('task-001');
    });

    it('should parse YAML with multiline strings', () => {
      const yaml = `
schemaVersion: "1.0"
hierarchyType: "simple"
project:
  organization: "test-org"
  project: "test-project"
workItems:
  - type: "Product Backlog Item"
    id: "pbi-001"
    title: "Test PBI"
    description: |
      This is a multiline
      description with
      multiple lines
`;

      const result = parseYaml(yaml);

      expect(result.workItems[0].description).toContain('multiline');
      expect(result.workItems[0].description).toContain('multiple lines');
    });

    it('should parse YAML with special characters in strings', () => {
      const yaml = `
schemaVersion: "1.0"
hierarchyType: "simple"
project:
  organization: "test-org"
  project: "test-project"
workItems:
  - type: "Product Backlog Item"
    id: "pbi-001"
    title: "Test: Special [chars] & symbols"
`;

      const result = parseYaml(yaml);

      expect(result.workItems[0].title).toBe('Test: Special [chars] & symbols');
    });

    it('should parse YAML with ADO metadata', () => {
      const yaml = `
schemaVersion: "1.0"
hierarchyType: "simple"
project:
  organization: "test-org"
  project: "test-project"
workItems:
  - type: "Product Backlog Item"
    id: "pbi-001"
    title: "Test PBI"
    _ado:
      workItemId: 123
      url: "https://dev.azure.com/test-org/test-project/_workitems/edit/123"
      rev: 5
      lastSyncedAt: "2025-01-15T10:00:00Z"
`;

      const result = parseYaml(yaml);

      expect(result.workItems[0]._ado).toBeDefined();
      expect(result.workItems[0]._ado?.workItemId).toBe(123);
      expect(result.workItems[0]._ado?.rev).toBe(5);
    });

    it('should parse YAML with tags array', () => {
      const yaml = `
schemaVersion: "1.0"
hierarchyType: "simple"
project:
  organization: "test-org"
  project: "test-project"
workItems:
  - type: "Product Backlog Item"
    id: "pbi-001"
    title: "Test PBI"
    tags:
      - "tag1"
      - "tag2"
      - "Q1-2025"
`;

      const result = parseYaml(yaml);

      expect(result.workItems[0].tags).toEqual(['tag1', 'tag2', 'Q1-2025']);
    });
  });

  describe('parseYamlFile', () => {
    it('should read and parse file from disk', async () => {
      const mockContent = `
schemaVersion: "1.0"
hierarchyType: "simple"
project:
  organization: "test-org"
  project: "test-project"
workItems:
  - type: "Product Backlog Item"
    id: "pbi-001"
    title: "Test PBI"
`;
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      const result = await parseYamlFile('/path/to/file.yaml');

      expect(fs.readFile).toHaveBeenCalledWith('/path/to/file.yaml', 'utf-8');
      expect(result.workItems[0].id).toBe('pbi-001');
    });

    it('should throw error when file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: no such file'));

      await expect(parseYamlFile('/nonexistent.yaml')).rejects.toThrow('ENOENT');
    });

    it('should throw error for file read permission issues', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(parseYamlFile('/protected.yaml')).rejects.toThrow('EACCES');
    });
  });

  describe('parseYamlWithTypes', () => {
    it('should parse YAML with default schema', () => {
      const yaml = `
schemaVersion: "1.0"
hierarchyType: "simple"
project:
  organization: "test-org"
  project: "test-project"
workItems:
  - type: "Product Backlog Item"
    id: "pbi-001"
    title: "Test PBI"
`;

      const result = parseYamlWithTypes(yaml);

      expect(result.schemaVersion).toBe('1.0');
    });

    it('should throw error for empty content', () => {
      expect(() => parseYamlWithTypes('')).toThrow('Empty YAML document');
    });
  });

  describe('parseYamlFileWithTypes', () => {
    it('should read and parse file with types', async () => {
      const mockContent = `
schemaVersion: "1.0"
hierarchyType: "simple"
project:
  organization: "test-org"
  project: "test-project"
workItems:
  - type: "Product Backlog Item"
    id: "pbi-001"
    title: "Test PBI"
`;
      vi.mocked(fs.readFile).mockResolvedValue(mockContent);

      const result = await parseYamlFileWithTypes('/path/to/file.yaml');

      expect(result.workItems[0].id).toBe('pbi-001');
    });
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await fileExists('/existing/file.yaml');

      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await fileExists('/nonexistent.yaml');

      expect(result).toBe(false);
    });
  });

  describe('getAllLocalIds', () => {
    it('should collect all IDs from flat structure', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001' }),
        createMockWorkItem({ id: 'pbi-002' }),
        createMockWorkItem({ id: 'pbi-003' }),
      ]);

      const ids = getAllLocalIds(doc);

      expect(ids.size).toBe(3);
      expect(ids.has('pbi-001')).toBe(true);
      expect(ids.has('pbi-002')).toBe(true);
      expect(ids.has('pbi-003')).toBe(true);
    });

    it('should collect IDs from nested structure', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren({ id: 'pbi-001' }, [
          { id: 'task-001', type: 'Task', title: 'Task 1' },
          { id: 'task-002', type: 'Task', title: 'Task 2' },
        ]),
      ]);

      const ids = getAllLocalIds(doc);

      expect(ids.size).toBe(3);
      expect(ids.has('pbi-001')).toBe(true);
      expect(ids.has('task-001')).toBe(true);
      expect(ids.has('task-002')).toBe(true);
    });

    it('should handle deeply nested structure', () => {
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
                    { type: 'Task', id: 'task-001', title: 'Task' },
                  ],
                },
              ],
            },
          ],
        },
      ]);

      const ids = getAllLocalIds(doc);

      expect(ids.size).toBe(4);
      expect(ids.has('epic-001')).toBe(true);
      expect(ids.has('feat-001')).toBe(true);
      expect(ids.has('pbi-001')).toBe(true);
      expect(ids.has('task-001')).toBe(true);
    });

    it('should return empty set for document with no work items', () => {
      const doc = {
        schemaVersion: '1.0' as const,
        hierarchyType: 'simple' as const,
        project: { organization: 'test', project: 'test' },
        workItems: [],
      };

      const ids = getAllLocalIds(doc);

      expect(ids.size).toBe(0);
    });
  });

  describe('findWorkItemById', () => {
    it('should find item at root level', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001', title: 'Target' }),
        createMockWorkItem({ id: 'pbi-002', title: 'Other' }),
      ]);

      const result = findWorkItemById(doc, 'pbi-001');

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Target');
    });

    it('should find item in nested children', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren({ id: 'pbi-001' }, [
          { id: 'task-001', type: 'Task', title: 'Target Task' },
        ]),
      ]);

      const result = findWorkItemById(doc, 'task-001');

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Target Task');
    });

    it('should find deeply nested item', () => {
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

      const result = findWorkItemById(doc, 'task-deep');

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Deep Task');
    });

    it('should return null for non-existent ID', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001' }),
      ]);

      const result = findWorkItemById(doc, 'non-existent');

      expect(result).toBeNull();
    });

    it('should return first match when searching by ID', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001', title: 'First Match' }),
      ]);

      const result = findWorkItemById(doc, 'pbi-001');

      expect(result?.title).toBe('First Match');
    });
  });

  describe('countWorkItems', () => {
    it('should count single item', () => {
      const doc = createMockDocument([createMockWorkItem()]);

      const count = countWorkItems(doc);

      expect(count).toBe(1);
    });

    it('should count multiple root items', () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001' }),
        createMockWorkItem({ id: 'pbi-002' }),
        createMockWorkItem({ id: 'pbi-003' }),
      ]);

      const count = countWorkItems(doc);

      expect(count).toBe(3);
    });

    it('should count items with children', () => {
      const doc = createMockDocument([
        createMockWorkItemWithChildren({ id: 'pbi-001' }, [
          { id: 'task-001', type: 'Task', title: 'Task 1' },
          { id: 'task-002', type: 'Task', title: 'Task 2' },
        ]),
      ]);

      const count = countWorkItems(doc);

      expect(count).toBe(3); // 1 PBI + 2 Tasks
    });

    it('should count deeply nested items', () => {
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
                    { type: 'Task', id: 'task-001', title: 'Task' },
                  ],
                },
              ],
            },
          ],
        },
      ]);

      const count = countWorkItems(doc);

      expect(count).toBe(4); // Epic + Feature + PBI + Task
    });

    it('should return 0 for empty document', () => {
      const doc = {
        schemaVersion: '1.0' as const,
        hierarchyType: 'simple' as const,
        project: { organization: 'test', project: 'test' },
        workItems: [],
      };

      const count = countWorkItems(doc);

      expect(count).toBe(0);
    });
  });
});
