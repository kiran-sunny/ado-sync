/**
 * Sync Command - Bi-directional sync with Azure DevOps
 */

import type { SyncOptions } from '../types/config.js';
import { parseYamlFile, fileExists } from '../yaml/parser.js';
import { writeYamlFile, backupYamlFile } from '../yaml/writer.js';
import { validateDocument } from '../yaml/validator.js';
import { loadConfig } from '../config/config-manager.js';
import { getAdoClient } from '../ado/client.js';
import { syncWorkItems } from '../core/sync-engine.js';
import { success, error as logError, warn, info } from '../utils/logger.js';
import { startSpinner, succeedSpinner, failSpinner } from '../utils/spinner.js';
import { colors, formatAction, formatId } from '../utils/colors.js';

/**
 * Execute sync command
 */
export async function syncCommand(
  file: string,
  options: SyncOptions
): Promise<void> {
  // Check file exists
  if (!(await fileExists(file))) {
    logError(`File not found: ${file}`);
    process.exit(1);
  }

  // Parse and validate
  startSpinner('Reading YAML file...');
  let doc;
  try {
    doc = await parseYamlFile(file);
    const validation = validateDocument(doc);
    if (!validation.valid) {
      failSpinner('Validation failed');
      for (const error of validation.errors) {
        logError(`  ${error.path}: ${error.message}`);
      }
      process.exit(1);
    }
    succeedSpinner('YAML file loaded');
  } catch (err) {
    failSpinner('Failed to read file');
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    process.exit(1);
  }

  // Load config
  const config = await loadConfig({
    organization: doc.project.organization,
    project: doc.project.project,
  });

  // Create client
  const client = getAdoClient({
    organization: config.organization,
    project: config.project,
  });

  // Test connection
  startSpinner('Connecting to Azure DevOps...');
  try {
    const connected = await client.testConnection();
    if (!connected) {
      failSpinner('Connection failed');
      logError('Could not connect to Azure DevOps.');
      process.exit(1);
    }
    succeedSpinner(`Connected to ${config.organization}/${config.project}`);
  } catch (err) {
    failSpinner('Connection failed');
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    process.exit(1);
  }

  // Dry run notice
  if (options.dryRun) {
    warn('\n🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Create backup before making changes
  if (!options.dryRun) {
    try {
      const backupPath = await backupYamlFile(file);
      info(`Backup created: ${colors.dim(backupPath)}`);
    } catch {
      warn('Could not create backup file');
    }
  }

  // Show strategy
  info(`\nConflict strategy: ${colors.info(options.strategy)}`);

  // Sync work items
  try {
    const { pullResults, pushResults } = await syncWorkItems(
      client,
      doc,
      config,
      options.strategy,
      { dryRun: options.dryRun }
    );

    // Display pull results
    console.log('\n' + colors.bold('Pull Results:'));
    displayPullSummary(pullResults);

    // Display push results
    console.log('\n' + colors.bold('Push Results:'));
    displayPushSummary(pushResults);

    // Save updated YAML
    if (!options.dryRun) {
      await writeYamlFile(file, doc);
      info(`\nUpdated ${colors.bold(file)}`);
    }

    // Check for failures
    const pullFailed = pullResults.filter(r => !r.success).length;
    const pushFailed = pushResults.filter(r => !r.success).length;
    const conflicts = pushResults.filter(r => r.action === 'conflict').length;

    if (pullFailed > 0 || pushFailed > 0 || conflicts > 0) {
      process.exit(1);
    }

    console.log('');
    success('Sync completed successfully!');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`Sync failed: ${message}`);
    process.exit(1);
  }
}

/**
 * Display pull summary
 */
function displayPullSummary(results: Array<{ success: boolean; action: string }>): void {
  const updated = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  info(`  ${colors.success('✓')} ${updated} items pulled`);
  if (failed > 0) {
    info(`  ${colors.error('✗')} ${failed} failed`);
  }
}

/**
 * Display push summary
 */
function displayPushSummary(results: Array<{
  success: boolean;
  action: string;
}>): void {
  const created = results.filter(r => r.action === 'create' && r.success).length;
  const updated = results.filter(r => r.action === 'update' && r.success).length;
  const skipped = results.filter(r => r.action === 'skip').length;
  const conflicts = results.filter(r => r.action === 'conflict').length;
  const failed = results.filter(r => !r.success && r.action !== 'conflict').length;

  if (created > 0) info(`  ${colors.create('+')} ${created} created`);
  if (updated > 0) info(`  ${colors.update('~')} ${updated} updated`);
  if (skipped > 0) info(`  ${colors.dim('-')} ${skipped} skipped`);
  if (conflicts > 0) info(`  ${colors.conflict('!')} ${conflicts} conflicts`);
  if (failed > 0) info(`  ${colors.error('✗')} ${failed} failed`);
}
