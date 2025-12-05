/**
 * Tests for Sync Engine module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  pushWorkItems,
  pullWorkItems,
  syncWorkItems,
  getSyncStatus,
} from '../../src/core/sync-engine.js';
import {
  createMockDocument,
  createMockWorkItem,
  createMockWorkItemWithChildren,
  createMockAdoMetadata,
  createMockAdoResponse,
} from '../test-utils.js';
import type { AdoClient } from '../../src/ado/client.js';
import type { ResolvedConfig } from '../../src/types/config.js';

// Mock ADO modules
vi.mock('../../src/ado/work-items.js', () => ({
  createWorkItem: vi.fn(),
  updateWorkItem: vi.fn(),
  getWorkItem: vi.fn(),
  getWorkItems: vi.fn(),
  addParentLink: vi.fn(),
  extractAdoMetadata: vi.fn(),
}));

vi.mock('../../src/ado/comments.js', () => ({
  getAllComments: vi.fn(),
}));

vi.mock('../../src/ado/pull-requests.js', () => ({
  getLinkedPullRequests: vi.fn(),
}));

// Import mocked functions
import {
  createWorkItem,
  updateWorkItem,
  getWorkItem,
  getWorkItems,
  addParentLink,
  extractAdoMetadata,
} from '../../src/ado/work-items.js';
import { getAllComments } from '../../src/ado/comments.js';
import { getLinkedPullRequests } from '../../src/ado/pull-requests.js';

describe('Sync Engine', () => {
  const mockClient = {} as AdoClient;
  const mockConfig: ResolvedConfig = {
    organization: 'test-org',
    project: 'test-project',
    defaults: {
      areaPath: 'test-project',
      iterationPath: 'test-project\\Sprint 1',
      state: 'New',
      priority: 2,
    },
    sync: {
      conflictStrategy: 'manual',
      batchSize: 50,
      includeComments: true,
      includePRs: true,
      includeHistory: false,
    },
    typeAliases: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pushWorkItems', () => {
    describe('create operations', () => {
      it('should create new work items without ADO metadata', async () => {
        const doc = createMockDocument([
          createMockWorkItem({ id: 'pbi-001', title: 'New PBI' }),
        ]);

        vi.mocked(createWorkItem).mockResolvedValue(
          createMockAdoResponse({ id: 123 })
        );
        vi.mocked(getWorkItem).mockResolvedValue(
          createMockAdoResponse({ id: 123, rev: 1 })
        );
        vi.mocked(extractAdoMetadata).mockReturnValue(
          createMockAdoMetadata({ workItemId: 123, rev: 1 })
        );

        const results = await pushWorkItems(mockClient, doc, mockConfig);

        expect(createWorkItem).toHaveBeenCalledWith(
          mockClient,
          'Product Backlog Item',
          expect.objectContaining({ title: 'New PBI' })
        );
        expect(results).toHaveLength(1);
        expect(results[0].action).toBe('create');
        expect(results[0].success).toBe(true);
        expect(results[0].workItemId).toBe(123);
      });

      it('should create parent link for child items', async () => {
        const doc = createMockDocument([
          createMockWorkItemWithChildren(
            {
              id: 'pbi-001',
              title: 'Parent PBI',
              state: 'New',
              _ado: createMockAdoMetadata({ workItemId: 100, rev: 1 }),
            },
            [{ id: 'task-001', type: 'Task', title: 'New Task' }]
          ),
        ]);

        // Mock getWorkItem to return matching item for parent (so it skips), return different values based on id
        vi.mocked(getWorkItem).mockImplementation(async (_client, id) => {
          if (id === 100) {
            return createMockAdoResponse({
              id: 100,
              rev: 1,
              fields: {
                'System.Title': 'Parent PBI',
                'System.State': 'New',
                'System.WorkItemType': 'Product Backlog Item',
              },
            });
          }
          return createMockAdoResponse({ id: id as number, rev: 1 });
        });
        vi.mocked(createWorkItem).mockResolvedValue(
          createMockAdoResponse({ id: 200 })
        );
        vi.mocked(extractAdoMetadata).mockReturnValue(
          createMockAdoMetadata({ workItemId: 200, rev: 1 })
        );

        const results = await pushWorkItems(mockClient, doc, mockConfig);

        // Should create parent link for the task
        expect(addParentLink).toHaveBeenCalledWith(mockClient, 200, 100);
      });

      it('should apply default values from config', async () => {
        const doc = createMockDocument([
          createMockWorkItem({ id: 'pbi-001', title: 'New PBI' }),
        ]);

        vi.mocked(createWorkItem).mockResolvedValue(
          createMockAdoResponse({ id: 123 })
        );
        vi.mocked(getWorkItem).mockResolvedValue(
          createMockAdoResponse({ id: 123 })
        );
        vi.mocked(extractAdoMetadata).mockReturnValue(
          createMockAdoMetadata({ workItemId: 123 })
        );

        await pushWorkItems(mockClient, doc, mockConfig);

        expect(createWorkItem).toHaveBeenCalledWith(
          mockClient,
          expect.anything(),
          expect.objectContaining({
            areaPath: 'test-project',
            iterationPath: 'test-project\\Sprint 1',
          })
        );
      });
    });

    describe('update operations', () => {
      it('should update existing work items with local changes', async () => {
        const doc = createMockDocument([
          createMockWorkItem({
            id: 'pbi-001',
            title: 'Updated Title',
            _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
          }),
        ]);

        vi.mocked(getWorkItem).mockResolvedValue(
          createMockAdoResponse({
            id: 123,
            rev: 1,
            fields: { 'System.Title': 'Original Title', 'System.WorkItemType': 'Product Backlog Item' },
          })
        );
        vi.mocked(updateWorkItem).mockResolvedValue(
          createMockAdoResponse({ id: 123, rev: 2 })
        );
        vi.mocked(extractAdoMetadata).mockReturnValue(
          createMockAdoMetadata({ workItemId: 123, rev: 2 })
        );

        const results = await pushWorkItems(mockClient, doc, mockConfig);

        expect(updateWorkItem).toHaveBeenCalledWith(
          mockClient,
          123,
          expect.objectContaining({ title: 'Updated Title' }),
          1 // Expected revision
        );
        expect(results[0].action).toBe('update');
        expect(results[0].success).toBe(true);
      });
    });

    describe('skip operations', () => {
      it('should skip items with no changes', async () => {
        const doc = createMockDocument([
          createMockWorkItem({
            id: 'pbi-001',
            title: 'Same Title',
            state: 'New',
            _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
          }),
        ]);

        vi.mocked(getWorkItem).mockResolvedValue(
          createMockAdoResponse({
            id: 123,
            rev: 1,
            fields: {
              'System.Title': 'Same Title',
              'System.State': 'New',
              'System.WorkItemType': 'Product Backlog Item',
            },
          })
        );

        const results = await pushWorkItems(mockClient, doc, mockConfig);

        expect(createWorkItem).not.toHaveBeenCalled();
        expect(updateWorkItem).not.toHaveBeenCalled();
        expect(results[0].action).toBe('skip');
      });

      it('should skip new items in update-only mode', async () => {
        const doc = createMockDocument([
          createMockWorkItem({ id: 'pbi-001', title: 'New PBI' }),
        ]);

        const results = await pushWorkItems(mockClient, doc, mockConfig, {
          updateOnly: true,
        });

        expect(createWorkItem).not.toHaveBeenCalled();
        expect(results[0].action).toBe('skip');
        expect(results[0].message).toContain('Update-only');
      });

      it('should skip existing items in create-only mode', async () => {
        const doc = createMockDocument([
          createMockWorkItem({
            id: 'pbi-001',
            _ado: createMockAdoMetadata({ workItemId: 123 }),
          }),
        ]);

        const results = await pushWorkItems(mockClient, doc, mockConfig, {
          createOnly: true,
        });

        expect(updateWorkItem).not.toHaveBeenCalled();
        expect(results[0].action).toBe('skip');
        expect(results[0].message).toContain('Create-only');
      });
    });

    describe('conflict handling', () => {
      it('should detect conflict when ADO has newer revision', async () => {
        const doc = createMockDocument([
          createMockWorkItem({
            id: 'pbi-001',
            title: 'Local Change',
            _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
          }),
        ]);

        vi.mocked(getWorkItem).mockResolvedValue(
          createMockAdoResponse({
            id: 123,
            rev: 5, // Newer revision
            fields: { 'System.Title': 'ADO Change', 'System.WorkItemType': 'Product Backlog Item' },
          })
        );

        const results = await pushWorkItems(mockClient, doc, mockConfig);

        expect(results[0].action).toBe('conflict');
        expect(results[0].success).toBe(false);
      });

      it('should force update with --force option', async () => {
        const doc = createMockDocument([
          createMockWorkItem({
            id: 'pbi-001',
            title: 'Force Update',
            _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
          }),
        ]);

        vi.mocked(getWorkItem).mockResolvedValue(
          createMockAdoResponse({
            id: 123,
            rev: 5,
            fields: { 'System.Title': 'Old', 'System.WorkItemType': 'Product Backlog Item' },
          })
        );
        vi.mocked(updateWorkItem).mockResolvedValue(
          createMockAdoResponse({ id: 123, rev: 6 })
        );
        vi.mocked(extractAdoMetadata).mockReturnValue(
          createMockAdoMetadata({ workItemId: 123, rev: 6 })
        );

        const results = await pushWorkItems(mockClient, doc, mockConfig, {
          force: true,
        });

        expect(updateWorkItem).toHaveBeenCalled();
        expect(results[0].action).toBe('update');
      });
    });

    describe('dry run', () => {
      it('should not make actual changes in dry-run mode', async () => {
        const doc = createMockDocument([
          createMockWorkItem({ id: 'pbi-001', title: 'New PBI' }),
        ]);

        const results = await pushWorkItems(mockClient, doc, mockConfig, {
          dryRun: true,
        });

        expect(createWorkItem).not.toHaveBeenCalled();
        expect(updateWorkItem).not.toHaveBeenCalled();
        expect(results[0].message).toContain('[DRY RUN]');
      });
    });

    describe('filtering', () => {
      it('should filter items by pattern', async () => {
        const doc = createMockDocument([
          createMockWorkItem({ id: 'pbi-001', title: 'PBI 1' }),
          createMockWorkItem({ id: 'pbi-002', title: 'PBI 2' }),
          createMockWorkItem({ id: 'task-001', title: 'Task 1' }),
        ]);

        vi.mocked(createWorkItem).mockResolvedValue(
          createMockAdoResponse({ id: 123 })
        );
        vi.mocked(getWorkItem).mockResolvedValue(
          createMockAdoResponse({ id: 123 })
        );
        vi.mocked(extractAdoMetadata).mockReturnValue(
          createMockAdoMetadata({ workItemId: 123 })
        );

        const results = await pushWorkItems(mockClient, doc, mockConfig, {
          filter: 'pbi-*',
        });

        expect(results).toHaveLength(2);
        expect(results.every(r => r.localId.startsWith('pbi-'))).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should handle API errors gracefully', async () => {
        const doc = createMockDocument([
          createMockWorkItem({ id: 'pbi-001', title: 'New PBI' }),
        ]);

        vi.mocked(createWorkItem).mockRejectedValue(
          new Error('API Error: 500 Internal Server Error')
        );

        const results = await pushWorkItems(mockClient, doc, mockConfig);

        expect(results[0].success).toBe(false);
        expect(results[0].error).toContain('API Error');
      });
    });
  });

  describe('pullWorkItems', () => {
    it('should return empty results for document with no ADO items', async () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001' }), // No _ado
      ]);

      const results = await pullWorkItems(mockClient, doc, mockConfig);

      expect(results).toHaveLength(0);
    });

    it('should pull updates for items with ADO IDs', async () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          _ado: createMockAdoMetadata({ workItemId: 123 }),
        }),
      ]);

      vi.mocked(getWorkItems).mockResolvedValue([
        createMockAdoResponse({ id: 123, rev: 2 }),
      ]);
      vi.mocked(extractAdoMetadata).mockReturnValue(
        createMockAdoMetadata({ workItemId: 123, rev: 2 })
      );

      const results = await pullWorkItems(mockClient, doc, mockConfig);

      expect(results).toHaveLength(1);
      expect(results[0].action).toBe('update');
      expect(results[0].success).toBe(true);
    });

    it('should pull comments when requested', async () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          _ado: createMockAdoMetadata({ workItemId: 123 }),
        }),
      ]);

      vi.mocked(getWorkItems).mockResolvedValue([
        createMockAdoResponse({ id: 123 }),
      ]);
      vi.mocked(extractAdoMetadata).mockReturnValue(
        createMockAdoMetadata({ workItemId: 123 })
      );
      vi.mocked(getAllComments).mockResolvedValue([
        { id: 1, author: 'user', date: '2025-01-15', text: 'Comment' },
      ]);

      await pullWorkItems(mockClient, doc, mockConfig, {
        includeComments: true,
      });

      expect(getAllComments).toHaveBeenCalledWith(mockClient, 123);
    });

    it('should pull PRs when requested', async () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          _ado: createMockAdoMetadata({ workItemId: 123 }),
        }),
      ]);

      vi.mocked(getWorkItems).mockResolvedValue([
        createMockAdoResponse({ id: 123 }),
      ]);
      vi.mocked(extractAdoMetadata).mockReturnValue(
        createMockAdoMetadata({ workItemId: 123 })
      );
      vi.mocked(getLinkedPullRequests).mockResolvedValue([
        { id: 456, title: 'PR', status: 'active', url: 'url' },
      ]);

      await pullWorkItems(mockClient, doc, mockConfig, {
        includePRs: true,
      });

      expect(getLinkedPullRequests).toHaveBeenCalled();
    });

    it('should handle missing ADO items', async () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          _ado: createMockAdoMetadata({ workItemId: 999 }),
        }),
      ]);

      vi.mocked(getWorkItems).mockResolvedValue([]); // Item not found

      const results = await pullWorkItems(mockClient, doc, mockConfig);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('not found');
    });
  });

  describe('syncWorkItems', () => {
    it('should pull then push', async () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        }),
      ]);

      vi.mocked(getWorkItems).mockResolvedValue([
        createMockAdoResponse({ id: 123, rev: 1 }),
      ]);
      vi.mocked(getWorkItem).mockResolvedValue(
        createMockAdoResponse({ id: 123, rev: 1 })
      );
      vi.mocked(extractAdoMetadata).mockReturnValue(
        createMockAdoMetadata({ workItemId: 123 })
      );

      const { pullResults, pushResults } = await syncWorkItems(
        mockClient,
        doc,
        mockConfig,
        'manual'
      );

      expect(pullResults).toBeDefined();
      expect(pushResults).toBeDefined();
    });

    it('should use force option with yaml-wins strategy', async () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          title: 'Local Value',
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        }),
      ]);

      vi.mocked(getWorkItems).mockResolvedValue([]);
      vi.mocked(getWorkItem).mockResolvedValue(
        createMockAdoResponse({
          id: 123,
          rev: 5, // Newer version
          fields: { 'System.Title': 'ADO Value', 'System.WorkItemType': 'Product Backlog Item' },
        })
      );
      vi.mocked(updateWorkItem).mockResolvedValue(
        createMockAdoResponse({ id: 123, rev: 6 })
      );
      vi.mocked(extractAdoMetadata).mockReturnValue(
        createMockAdoMetadata({ workItemId: 123, rev: 6 })
      );

      await syncWorkItems(mockClient, doc, mockConfig, 'yaml-wins');

      // Should force update even with conflict
      expect(updateWorkItem).toHaveBeenCalled();
    });
  });

  describe('getSyncStatus', () => {
    it('should return "new" status for items without ADO ID', async () => {
      const doc = createMockDocument([
        createMockWorkItem({ id: 'pbi-001' }),
      ]);

      vi.mocked(getWorkItems).mockResolvedValue([]);

      const status = await getSyncStatus(mockClient, doc);

      expect(status[0].status).toBe('new');
      expect(status[0].adoId).toBeNull();
    });

    it('should return "synced" status for unchanged items', async () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          title: 'Same Title',
          state: 'New',
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        }),
      ]);

      vi.mocked(getWorkItems).mockResolvedValue([
        createMockAdoResponse({
          id: 123,
          rev: 1,
          fields: {
            'System.Title': 'Same Title',
            'System.State': 'New',
            'System.WorkItemType': 'Product Backlog Item',
          },
        }),
      ]);

      const status = await getSyncStatus(mockClient, doc);

      expect(status[0].status).toBe('synced');
      expect(status[0].adoId).toBe(123);
    });

    it('should return "pending" status for modified items', async () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          title: 'Modified Title',
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        }),
      ]);

      vi.mocked(getWorkItems).mockResolvedValue([
        createMockAdoResponse({
          id: 123,
          rev: 1,
          fields: { 'System.Title': 'Original Title', 'System.WorkItemType': 'Product Backlog Item' },
        }),
      ]);

      const status = await getSyncStatus(mockClient, doc);

      expect(status[0].status).toBe('pending');
    });

    it('should return "conflict" status when ADO has newer revision', async () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          title: 'Local Change',
          _ado: createMockAdoMetadata({ workItemId: 123, rev: 1 }),
        }),
      ]);

      vi.mocked(getWorkItems).mockResolvedValue([
        createMockAdoResponse({
          id: 123,
          rev: 5, // Newer revision
          fields: { 'System.Title': 'ADO Change', 'System.WorkItemType': 'Product Backlog Item' },
        }),
      ]);

      const status = await getSyncStatus(mockClient, doc);

      expect(status[0].status).toBe('conflict');
    });

    it('should return "pending" for items not found in ADO', async () => {
      const doc = createMockDocument([
        createMockWorkItem({
          id: 'pbi-001',
          _ado: createMockAdoMetadata({ workItemId: 999 }),
        }),
      ]);

      vi.mocked(getWorkItems).mockResolvedValue([]); // Not found

      const status = await getSyncStatus(mockClient, doc);

      expect(status[0].status).toBe('pending');
    });
  });
});
