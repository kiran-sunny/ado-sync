/**
 * Tests for Configuration Manager module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { ConfigManager, getConfigManager, loadConfig } from '../../src/config/config-manager.js';

// Mock cosmiconfig
vi.mock('cosmiconfig', () => ({
  cosmiconfig: vi.fn(() => ({
    search: vi.fn(),
  })),
}));

import { cosmiconfig } from 'cosmiconfig';

describe('ConfigManager', () => {
  let manager: ConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ConfigManager();
    // Reset environment variables
    delete process.env['ADO_ORGANIZATION'];
    delete process.env['ADO_PROJECT'];
  });

  describe('load', () => {
    it('should load configuration from cosmiconfig', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue({
          config: {
            organization: 'test-org',
            project: 'test-project',
          },
          filepath: '/path/to/.ado-sync.yaml',
        }),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

      const config = await manager.load();

      expect(config).toEqual({
        organization: 'test-org',
        project: 'test-project',
      });
    });

    it('should return empty config when no file found', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue(null),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

      const config = await manager.load();

      expect(config).toEqual({});
    });

    it('should throw error for invalid configuration', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue({
          config: {
            sync: {
              batchSize: 500, // Invalid: max is 200
            },
          },
          filepath: '/path/to/.ado-sync.yaml',
        }),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

      await expect(manager.load()).rejects.toThrow('Invalid configuration');
    });

    it('should validate all configuration options', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue({
          config: {
            organization: 'test-org',
            project: 'test-project',
            defaults: {
              areaPath: 'test-project\\Team1',
              iterationPath: 'test-project\\Sprint 1',
              state: 'New',
              priority: 2,
            },
            sync: {
              conflictStrategy: 'yaml-wins',
              batchSize: 50,
              includeComments: true,
              includePRs: false,
              includeHistory: true,
            },
            typeAliases: {
              pbi: 'Product Backlog Item',
            },
          },
          filepath: '/path/to/.ado-sync.yaml',
        }),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

      const config = await manager.load();

      expect(config.organization).toBe('test-org');
      expect(config.defaults?.priority).toBe(2);
      expect(config.sync?.conflictStrategy).toBe('yaml-wins');
    });
  });

  describe('resolve', () => {
    beforeEach(() => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue({
          config: {
            organization: 'file-org',
            project: 'file-project',
          },
          filepath: '/path/to/.ado-sync.yaml',
        }),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);
    });

    it('should merge config with defaults', async () => {
      const resolved = await manager.resolve();

      expect(resolved.organization).toBe('file-org');
      expect(resolved.project).toBe('file-project');
      expect(resolved.sync).toBeDefined();
      expect(resolved.defaults).toBeDefined();
    });

    it('should use environment variables over config file', async () => {
      process.env['ADO_ORGANIZATION'] = 'env-org';
      process.env['ADO_PROJECT'] = 'env-project';

      const resolved = await manager.resolve();

      expect(resolved.organization).toBe('env-org');
      expect(resolved.project).toBe('env-project');
    });

    it('should apply overrides', async () => {
      const resolved = await manager.resolve({
        organization: 'override-org',
      });

      expect(resolved.organization).toBe('override-org');
    });

    it('should throw error when organization is missing', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue({
          config: { project: 'test-project' },
          filepath: '/path/to/.ado-sync.yaml',
        }),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

      const newManager = new ConfigManager();
      await expect(newManager.resolve()).rejects.toThrow('organization not configured');
    });

    it('should throw error when project is missing', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue({
          config: { organization: 'test-org' },
          filepath: '/path/to/.ado-sync.yaml',
        }),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

      const newManager = new ConfigManager();
      await expect(newManager.resolve()).rejects.toThrow('project not configured');
    });

    it('should include default sync config', async () => {
      const resolved = await manager.resolve();

      expect(resolved.sync.batchSize).toBeDefined();
      expect(resolved.sync.conflictStrategy).toBeDefined();
    });

    it('should merge type aliases with defaults', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue({
          config: {
            organization: 'test-org',
            project: 'test-project',
            typeAliases: { custom: 'Custom Type' },
          },
          filepath: '/path/to/.ado-sync.yaml',
        }),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

      const newManager = new ConfigManager();
      const resolved = await newManager.resolve();

      expect(resolved.typeAliases.custom).toBe('Custom Type');
      expect(resolved.typeAliases.pbi).toBe('Product Backlog Item'); // Default
    });
  });

  describe('save', () => {
    it('should save configuration to file', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await manager.save({ organization: 'test-org' }, '/path/to/config.yaml');

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/path/to/config.yaml',
        expect.stringContaining('organization'),
        'utf-8'
      );
    });

    it('should use default path when not provided', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await manager.save({ organization: 'test-org' });

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.ado-sync.yaml'),
        expect.any(String),
        'utf-8'
      );
    });
  });

  describe('get', () => {
    it('should return config value by key', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue({
          config: {
            organization: 'test-org',
            project: 'test-project',
          },
          filepath: '/path/to/.ado-sync.yaml',
        }),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

      await manager.load();
      const org = manager.get('organization');

      expect(org).toBe('test-org');
    });

    it('should return undefined for missing key', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue({
          config: {},
          filepath: '/path/to/.ado-sync.yaml',
        }),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

      await manager.load();
      const value = manager.get('organization');

      expect(value).toBeUndefined();
    });
  });

  describe('set', () => {
    it('should set config value', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue({
          config: {},
          filepath: '/path/to/.ado-sync.yaml',
        }),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await manager.load();
      await manager.set('organization', 'new-org');

      expect(manager.get('organization')).toBe('new-org');
    });
  });

  describe('delete', () => {
    it('should delete config value', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue({
          config: { organization: 'test-org' },
          filepath: '/path/to/.ado-sync.yaml',
        }),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await manager.load();
      await manager.delete('organization');

      expect(manager.get('organization')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all config', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue({
          config: {
            organization: 'test-org',
            project: 'test-project',
          },
          filepath: '/path/to/.ado-sync.yaml',
        }),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

      await manager.load();
      const all = manager.getAll();

      expect(all.organization).toBe('test-org');
      expect(all.project).toBe('test-project');
    });

    it('should return empty object before load', () => {
      const all = manager.getAll();

      expect(all).toEqual({});
    });
  });

  describe('getConfigPath', () => {
    it('should return config file path after load', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue({
          config: {},
          filepath: '/path/to/.ado-sync.yaml',
        }),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

      await manager.load();
      const path = manager.getConfigPath();

      expect(path).toBe('/path/to/.ado-sync.yaml');
    });

    it('should return null when no config found', async () => {
      const mockExplorer = {
        search: vi.fn().mockResolvedValue(null),
      };
      vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

      await manager.load();
      const path = manager.getConfigPath();

      expect(path).toBeNull();
    });
  });

  describe('init', () => {
    it('should initialize config file with defaults', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await manager.init('/path/to/new-config.yaml', {
        organization: 'my-org',
        project: 'my-project',
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/path/to/new-config.yaml',
        expect.stringContaining('organization'),
        'utf-8'
      );
    });
  });
});

describe('getConfigManager', () => {
  it('should return singleton instance', () => {
    const manager1 = getConfigManager();
    const manager2 = getConfigManager();

    expect(manager1).toBe(manager2);
  });
});

describe('loadConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['ADO_ORGANIZATION'] = 'env-org';
    process.env['ADO_PROJECT'] = 'env-project';
  });

  it('should load and resolve config', async () => {
    const mockExplorer = {
      search: vi.fn().mockResolvedValue({
        config: {},
        filepath: '/path/to/.ado-sync.yaml',
      }),
    };
    vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

    const config = await loadConfig();

    expect(config.organization).toBe('env-org');
    expect(config.project).toBe('env-project');
  });

  it('should apply overrides to loaded config', async () => {
    // Clear env vars to test override behavior
    delete process.env['ADO_ORGANIZATION'];
    delete process.env['ADO_PROJECT'];

    const mockExplorer = {
      search: vi.fn().mockResolvedValue({
        config: {
          organization: 'file-org',
          project: 'file-project',
        },
        filepath: '/path/to/.ado-sync.yaml',
      }),
    };
    vi.mocked(cosmiconfig).mockReturnValue(mockExplorer as any);

    const config = await loadConfig({
      organization: 'override-org',
    });

    expect(config.organization).toBe('override-org');
    expect(config.project).toBe('file-project');
  });
});
