/**
 * Config Command - Manage configuration
 */

import type { ConfigAction } from '../types/config.js';
import { getConfigManager } from '../config/config-manager.js';
import { storePat, getPat, deletePat, listStoredOrganizations, isValidPatFormat } from '../config/credentials.js';
import { success, error as logError, info, warn } from '../utils/logger.js';
import { colors } from '../utils/colors.js';
import { renderKeyValue } from '../utils/table.js';

/**
 * Execute config command
 */
export async function configCommand(
  action: string,
  key?: string,
  value?: string
): Promise<void> {
  const configManager = getConfigManager();

  switch (action) {
    case 'list':
      await listConfig(configManager);
      break;

    case 'get':
      if (!key) {
        logError('Key is required for "get" action');
        process.exit(1);
      }
      await getConfig(configManager, key);
      break;

    case 'set':
      if (!key) {
        logError('Key is required for "set" action');
        process.exit(1);
      }
      if (value === undefined) {
        logError('Value is required for "set" action');
        process.exit(1);
      }
      await setConfig(configManager, key, value);
      break;

    case 'delete':
      if (!key) {
        logError('Key is required for "delete" action');
        process.exit(1);
      }
      await deleteConfig(configManager, key);
      break;

    default:
      logError(`Unknown action: ${action}`);
      info('Available actions: list, get, set, delete');
      process.exit(1);
  }
}

/**
 * List all configuration
 */
async function listConfig(configManager: ReturnType<typeof getConfigManager>): Promise<void> {
  await configManager.load();
  const config = configManager.getAll();
  const configPath = configManager.getConfigPath();

  if (configPath) {
    info(`Configuration file: ${colors.dim(configPath)}\n`);
  } else {
    info('No configuration file found. Using defaults.\n');
  }

  // Display config
  if (Object.keys(config).length === 0) {
    info('No configuration set.');
  } else {
    console.log(renderKeyValue(config as Record<string, unknown>));
  }

  // Show environment variables
  console.log('\n' + colors.bold('Environment Variables:'));
  const envVars: Record<string, unknown> = {
    ADO_ORGANIZATION: process.env['ADO_ORGANIZATION'] ?? colors.dim('(not set)'),
    ADO_PROJECT: process.env['ADO_PROJECT'] ?? colors.dim('(not set)'),
    ADO_PAT: process.env['ADO_PAT'] ? colors.dim('(set)') : colors.dim('(not set)'),
  };
  console.log(renderKeyValue(envVars));

  // Show stored PATs
  const storedOrgs = await listStoredOrganizations();
  if (storedOrgs.length > 0) {
    console.log('\n' + colors.bold('Stored PATs (keychain):'));
    for (const org of storedOrgs) {
      info(`  ${org}`);
    }
  }
}

/**
 * Get a configuration value
 */
async function getConfig(
  configManager: ReturnType<typeof getConfigManager>,
  key: string
): Promise<void> {
  // Special handling for PAT
  if (key === 'pat') {
    const pat = await getPat();
    if (pat) {
      // Mask the PAT for display
      const masked = pat.substring(0, 4) + '...' + pat.substring(pat.length - 4);
      info(`pat: ${masked}`);
    } else {
      info('pat: ' + colors.dim('(not set)'));
    }
    return;
  }

  await configManager.load();
  const value = configManager.get(key as keyof ReturnType<typeof configManager.getAll>);

  if (value !== undefined) {
    if (typeof value === 'object') {
      console.log(JSON.stringify(value, null, 2));
    } else {
      console.log(value);
    }
  } else {
    info(`${key}: ` + colors.dim('(not set)'));
  }
}

/**
 * Set a configuration value
 */
async function setConfig(
  configManager: ReturnType<typeof getConfigManager>,
  key: string,
  value: string
): Promise<void> {
  // Special handling for PAT
  if (key === 'pat') {
    if (!isValidPatFormat(value)) {
      warn('Warning: PAT format looks unusual. Proceeding anyway...');
    }

    // Get organization from config or env
    await configManager.load();
    const org = configManager.get('organization') ?? process.env['ADO_ORGANIZATION'] ?? 'default';

    const stored = await storePat(org, value);
    if (stored) {
      success(`PAT stored securely in keychain for organization: ${org}`);
    } else {
      warn('Could not store PAT in keychain. Set ADO_PAT environment variable instead.');
    }
    return;
  }

  // Handle nested keys (e.g., sync.batchSize)
  const parts = key.split('.');
  if (parts.length > 1) {
    await configManager.load();
    const config = configManager.getAll();
    let current: Record<string, unknown> = config as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    // Parse value (try JSON, then number, then string)
    let parsedValue: unknown = value;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      const num = Number(value);
      if (!isNaN(num)) {
        parsedValue = num;
      }
    }

    current[parts[parts.length - 1]!] = parsedValue;
    await configManager.save(config);
  } else {
    // Parse value
    let parsedValue: unknown = value;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      const num = Number(value);
      if (!isNaN(num)) {
        parsedValue = num;
      }
    }

    await configManager.load();
    await configManager.set(key as 'organization' | 'project', parsedValue as string);
  }

  success(`Set ${key} = ${value}`);
}

/**
 * Delete a configuration value
 */
async function deleteConfig(
  configManager: ReturnType<typeof getConfigManager>,
  key: string
): Promise<void> {
  // Special handling for PAT
  if (key === 'pat') {
    await configManager.load();
    const org = configManager.get('organization') ?? process.env['ADO_ORGANIZATION'] ?? 'default';

    const deleted = await deletePat(org);
    if (deleted) {
      success(`PAT deleted from keychain for organization: ${org}`);
    } else {
      warn('No PAT found in keychain to delete');
    }
    return;
  }

  await configManager.load();
  await configManager.delete(key as 'organization' | 'project');
  success(`Deleted ${key}`);
}
