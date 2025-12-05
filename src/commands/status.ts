/**
 * Status Command - Show sync status of all items
 */

import type { StatusOptions } from '../types/config.js';
import { parseYamlFile, fileExists } from '../yaml/parser.js';
import { validateDocument } from '../yaml/validator.js';
import { loadConfig } from '../config/config-manager.js';
import { getAdoClient } from '../ado/client.js';
import { getSyncStatus } from '../core/sync-engine.js';
import { error as logError, info } from '../utils/logger.js';
import { startSpinner, succeedSpinner, failSpinner } from '../utils/spinner.js';
import { colors, formatStatus, formatId } from '../utils/colors.js';
import { renderTable } from '../utils/table.js';
import { formatRelativeTime } from '../utils/index.js';

/**
 * Execute status command
 */
export async function statusCommand(
  file: string,
  options: StatusOptions
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
      process.exit(1);
    }
    succeedSpinner(`Connected to ${config.organization}/${config.project}`);
  } catch (err) {
    failSpinner('Connection failed');
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    process.exit(1);
  }

  // Get sync status
  startSpinner('Checking sync status...');
  try {
    let status = await getSyncStatus(client, doc);
    succeedSpinner('Status retrieved');

    // Filter if requested
    if (options.filter) {
      status = status.filter(s => s.status === options.filter);
    }

    // Output based on format
    console.log('');
    if (options.format === 'json') {
      console.log(JSON.stringify(status, null, 2));
    } else {
      displayStatusTable(status);
      displayStatusSummary(status);
    }
  } catch (err) {
    failSpinner('Failed to get status');
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    process.exit(1);
  }
}

/**
 * Display status as table
 */
function displayStatusTable(status: Array<{
  localId: string;
  adoId: number | null;
  status: string;
  lastSyncedAt: string | null;
}>): void {
  if (status.length === 0) {
    info('No work items found');
    return;
  }

  const tableData = status.map(s => ({
    id: s.localId,
    adoId: s.adoId ? formatId(s.adoId, '#') : colors.dim('-'),
    status: formatStatus(s.status),
    lastSync: s.lastSyncedAt ? formatRelativeTime(s.lastSyncedAt) : colors.dim('never'),
  }));

  const table = renderTable(tableData, {
    columns: [
      { header: 'Local ID', key: 'id', width: 25 },
      { header: 'ADO ID', key: 'adoId', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Last Sync', key: 'lastSync', width: 20 },
    ],
  });

  console.log(table);
}

/**
 * Display status summary
 */
function displayStatusSummary(status: Array<{ status: string }>): void {
  const synced = status.filter(s => s.status === 'synced').length;
  const pending = status.filter(s => s.status === 'pending').length;
  const conflict = status.filter(s => s.status === 'conflict').length;
  const newItems = status.filter(s => s.status === 'new').length;

  console.log('\n' + colors.bold('Summary:'));
  info(`  ${colors.synced(`${synced} synced`)}`);
  info(`  ${colors.pending(`${pending} pending`)}`);
  info(`  ${colors.new(`${newItems} new`)}`);
  if (conflict > 0) {
    info(`  ${colors.conflict(`${conflict} conflicts`)}`);
  }
}
