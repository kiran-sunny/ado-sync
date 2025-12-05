#!/usr/bin/env node

/**
 * ADO Sync - Bi-directional sync between YAML and Azure DevOps
 *
 * Usage:
 *   ado-sync init [filename]           Initialize a new YAML file
 *   ado-sync validate <file>           Validate YAML against schema
 *   ado-sync push <file>               Push work items to ADO
 *   ado-sync pull <file>               Pull updates from ADO
 *   ado-sync sync <file>               Bi-directional sync
 *   ado-sync diff <file>               Show differences
 *   ado-sync status <file>             Show sync status
 *   ado-sync link <file> <id> <adoId>  Link to existing ADO item
 *   ado-sync config <action>           Manage configuration
 */

import { createCli } from './cli.js';
import { setLogLevel } from './utils/logger.js';
import type { LogLevel } from './utils/logger.js';

// Set log level from environment
const logLevel = (process.env['ADO_SYNC_LOG_LEVEL'] ?? 'info') as LogLevel;
setLogLevel(logLevel);

// Create and run CLI
const program = createCli();

program.parseAsync(process.argv).catch(error => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
