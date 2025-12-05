/**
 * Configuration Types
 */

import type { ConflictStrategy } from './work-item.js';

/**
 * Sync configuration options
 */
export interface SyncConfig {
  conflictStrategy: ConflictStrategy;
  batchSize: number;
  includeComments: boolean;
  includePRs: boolean;
  includeHistory: boolean;
}

/**
 * Default values configuration
 */
export interface DefaultsConfig {
  areaPath?: string;
  iterationPath?: string;
  state?: string;
  priority?: number;
}

/**
 * Type aliases for shorter YAML
 */
export interface TypeAliases {
  [alias: string]: string;
}

/**
 * Custom field mappings
 */
export interface CustomFields {
  [yamlField: string]: string; // ADO field reference name
}

/**
 * Main configuration structure
 */
export interface Config {
  organization?: string;
  project?: string;
  defaults?: DefaultsConfig;
  sync?: Partial<SyncConfig>;
  typeAliases?: TypeAliases;
  customFields?: CustomFields;
}

/**
 * Resolved configuration (with all defaults applied)
 */
export interface ResolvedConfig {
  organization: string;
  project: string;
  defaults: DefaultsConfig;
  sync: SyncConfig;
  typeAliases: TypeAliases;
  customFields: CustomFields;
}

/**
 * Default sync configuration
 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  conflictStrategy: 'manual',
  batchSize: 50,
  includeComments: true,
  includePRs: true,
  includeHistory: false,
};

/**
 * Default type aliases
 */
export const DEFAULT_TYPE_ALIASES: TypeAliases = {
  pbi: 'Product Backlog Item',
  story: 'User Story',
  epic: 'Epic',
  feature: 'Feature',
  task: 'Task',
  bug: 'Bug',
  issue: 'Issue',
};

/**
 * CLI command options
 */
export interface PushOptions {
  dryRun: boolean;
  force: boolean;
  createOnly: boolean;
  updateOnly: boolean;
  filter?: string;
  batchSize?: number;
}

export interface PullOptions {
  includeComments: boolean;
  includePRs: boolean;
  includeHistory: boolean;
  overwriteLocal: boolean;
}

export interface SyncOptions {
  strategy: ConflictStrategy;
  dryRun: boolean;
}

export interface DiffOptions {
  format: 'table' | 'json' | 'yaml';
  fields?: string[];
}

export interface StatusOptions {
  format: 'table' | 'json';
  filter?: 'synced' | 'pending' | 'conflict' | 'new';
}

export interface InitOptions {
  hierarchy: 'full' | 'medium' | 'simple';
  template: boolean;
  org?: string;
  project?: string;
}

export interface ValidateOptions {
  strict: boolean;
  checkAdo: boolean;
}

export interface ConfigAction {
  action: 'get' | 'set' | 'list' | 'delete';
  key?: string;
  value?: string;
}
