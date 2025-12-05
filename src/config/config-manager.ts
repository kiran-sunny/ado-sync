/**
 * Configuration Manager - Handles loading and saving configuration
 */

import { cosmiconfig } from 'cosmiconfig';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import type {
  Config,
  ResolvedConfig,
  SyncConfig,
  DefaultsConfig,
  TypeAliases,
  CustomFields,
} from '../types/index.js';
import { DEFAULT_SYNC_CONFIG, DEFAULT_TYPE_ALIASES } from '../types/index.js';
import { getPat } from './credentials.js';

/**
 * Configuration schema for validation
 */
const ConfigSchema = z.object({
  organization: z.string().optional(),
  project: z.string().optional(),
  defaults: z
    .object({
      areaPath: z.string().optional(),
      iterationPath: z.string().optional(),
      state: z.string().optional(),
      priority: z.number().min(1).max(4).optional(),
    })
    .optional(),
  sync: z
    .object({
      conflictStrategy: z.enum(['ado-wins', 'yaml-wins', 'manual']).optional(),
      batchSize: z.number().min(1).max(200).optional(),
      includeComments: z.boolean().optional(),
      includePRs: z.boolean().optional(),
      includeHistory: z.boolean().optional(),
    })
    .optional(),
  typeAliases: z.record(z.string()).optional(),
  customFields: z.record(z.string()).optional(),
});

const MODULE_NAME = 'ado-sync';

/**
 * Configuration search places
 */
const SEARCH_PLACES = [
  `.${MODULE_NAME}.yaml`,
  `.${MODULE_NAME}.yml`,
  `.${MODULE_NAME}.json`,
  `.${MODULE_NAME}rc`,
  `.${MODULE_NAME}rc.json`,
  `.${MODULE_NAME}rc.yaml`,
  `.${MODULE_NAME}rc.yml`,
  `${MODULE_NAME}.config.js`,
  `${MODULE_NAME}.config.cjs`,
];

/**
 * Configuration Manager class
 */
export class ConfigManager {
  private config: Config | null = null;
  private configPath: string | null = null;

  /**
   * Load configuration from file system
   */
  async load(searchFrom?: string): Promise<Config> {
    const explorer = cosmiconfig(MODULE_NAME, {
      searchPlaces: SEARCH_PLACES,
    });

    const result = await explorer.search(searchFrom);

    if (result) {
      const parsed = ConfigSchema.safeParse(result.config);
      if (parsed.success) {
        this.config = parsed.data;
        this.configPath = result.filepath;
      } else {
        throw new Error(`Invalid configuration in ${result.filepath}: ${parsed.error.message}`);
      }
    } else {
      this.config = {};
    }

    return this.config;
  }

  /**
   * Get resolved configuration with defaults
   */
  async resolve(overrides?: Partial<Config>): Promise<ResolvedConfig> {
    if (!this.config) {
      await this.load();
    }

    const merged: Config = {
      ...this.config,
      ...overrides,
    };

    // Get organization from env or config
    const organization = process.env['ADO_ORGANIZATION'] ?? merged.organization;
    const project = process.env['ADO_PROJECT'] ?? merged.project;

    if (!organization) {
      throw new Error(
        'Azure DevOps organization not configured. Set ADO_ORGANIZATION env var or add to config.'
      );
    }

    if (!project) {
      throw new Error(
        'Azure DevOps project not configured. Set ADO_PROJECT env var or add to config.'
      );
    }

    const syncConfig: SyncConfig = {
      ...DEFAULT_SYNC_CONFIG,
      ...merged.sync,
    };

    const defaults: DefaultsConfig = merged.defaults ?? {};

    const typeAliases: TypeAliases = {
      ...DEFAULT_TYPE_ALIASES,
      ...merged.typeAliases,
    };

    const customFields: CustomFields = merged.customFields ?? {};

    return {
      organization,
      project,
      defaults,
      sync: syncConfig,
      typeAliases,
      customFields,
    };
  }

  /**
   * Save configuration to file
   */
  async save(config: Config, filePath?: string): Promise<void> {
    const targetPath = filePath ?? this.configPath ?? `.${MODULE_NAME}.yaml`;

    const content = yaml.dump(config, {
      indent: 2,
      lineWidth: 100,
      quotingType: '"',
    });

    await fs.writeFile(targetPath, content, 'utf-8');
    this.config = config;
    this.configPath = targetPath;
  }

  /**
   * Get a specific configuration value
   */
  get<K extends keyof Config>(key: K): Config[K] | undefined {
    return this.config?.[key];
  }

  /**
   * Set a specific configuration value
   */
  async set<K extends keyof Config>(key: K, value: Config[K]): Promise<void> {
    if (!this.config) {
      await this.load();
    }

    this.config = {
      ...this.config,
      [key]: value,
    };

    if (this.configPath) {
      await this.save(this.config, this.configPath);
    }
  }

  /**
   * Delete a configuration value
   */
  async delete<K extends keyof Config>(key: K): Promise<void> {
    if (!this.config) {
      await this.load();
    }

    if (this.config) {
      delete this.config[key];

      if (this.configPath) {
        await this.save(this.config, this.configPath);
      }
    }
  }

  /**
   * Get all configuration
   */
  getAll(): Config {
    return this.config ?? {};
  }

  /**
   * Get config file path
   */
  getConfigPath(): string | null {
    return this.configPath;
  }

  /**
   * Check if config file exists
   */
  async exists(): Promise<boolean> {
    if (!this.configPath) {
      await this.load();
    }
    return this.configPath !== null;
  }

  /**
   * Initialize a new config file
   */
  async init(
    filePath: string,
    options: { organization?: string; project?: string } = {}
  ): Promise<void> {
    const config: Config = {
      organization: options.organization,
      project: options.project,
      defaults: {
        areaPath: options.project,
        iterationPath: options.project,
      },
      sync: {
        conflictStrategy: 'manual',
        batchSize: 50,
        includeComments: true,
        includePRs: true,
        includeHistory: false,
      },
      typeAliases: {
        pbi: 'Product Backlog Item',
        story: 'User Story',
      },
    };

    await this.save(config, filePath);
  }
}

/**
 * Singleton instance
 */
let configManagerInstance: ConfigManager | null = null;

/**
 * Get configuration manager instance
 */
export function getConfigManager(): ConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManager();
  }
  return configManagerInstance;
}

/**
 * Load and resolve configuration
 */
export async function loadConfig(overrides?: Partial<Config>): Promise<ResolvedConfig> {
  const manager = getConfigManager();
  await manager.load();
  return manager.resolve(overrides);
}
