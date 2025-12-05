/**
 * Link Command - Link local YAML items to existing ADO work items
 */

import { parseYamlFile, fileExists, findWorkItemById } from '../yaml/parser.js';
import { writeYamlFile } from '../yaml/writer.js';
import { validateDocument } from '../yaml/validator.js';
import { loadConfig } from '../config/config-manager.js';
import { getAdoClient } from '../ado/client.js';
import { getWorkItem, extractAdoMetadata } from '../ado/work-items.js';
import { success, error as logError, info, warn } from '../utils/logger.js';
import { startSpinner, succeedSpinner, failSpinner } from '../utils/spinner.js';
import { colors, formatId } from '../utils/colors.js';

/**
 * Execute link command
 */
export async function linkCommand(
  file: string,
  localId: string,
  adoId: string
): Promise<void> {
  const adoWorkItemId = parseInt(adoId, 10);
  if (isNaN(adoWorkItemId)) {
    logError(`Invalid ADO work item ID: ${adoId}`);
    process.exit(1);
  }

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

  // Find local item
  const item = findWorkItemById(doc, localId);
  if (!item) {
    logError(`Local item not found: ${localId}`);
    process.exit(1);
  }

  // Check if already linked
  if (item._ado?.workItemId) {
    warn(`Item "${localId}" is already linked to ADO #${item._ado.workItemId}`);
    info('Use --force to override (not implemented yet)');
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

  // Verify ADO work item exists
  startSpinner(`Verifying ADO work item #${adoWorkItemId}...`);
  try {
    const adoItem = await getWorkItem(client, adoWorkItemId, 'Relations');
    succeedSpinner(`Found: "${adoItem.fields['System.Title']}"`);

    // Verify types match
    const adoType = adoItem.fields['System.WorkItemType'];
    if (adoType !== item.type) {
      warn(`Type mismatch: Local is "${item.type}", ADO is "${adoType}"`);
      info('Proceeding anyway...');
    }

    // Update local item with ADO metadata
    const metadata = extractAdoMetadata(adoItem, config.project, config.organization);
    item._ado = metadata;

    // Save file
    await writeYamlFile(file, doc);

    console.log('');
    success(`Linked ${colors.bold(localId)} → ${formatId(adoWorkItemId, '#')}`);
    info(`\nTo sync changes, run: ado-sync push ${file}`);
  } catch (err) {
    failSpinner('Failed to verify ADO work item');
    const message = err instanceof Error ? err.message : String(err);
    logError(message);
    process.exit(1);
  }
}

/**
 * Execute unlink command
 */
export async function unlinkCommand(
  file: string,
  localId: string
): Promise<void> {
  // Check file exists
  if (!(await fileExists(file))) {
    logError(`File not found: ${file}`);
    process.exit(1);
  }

  // Parse and validate
  let doc;
  try {
    doc = await parseYamlFile(file);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`Failed to read file: ${message}`);
    process.exit(1);
  }

  // Find local item
  const item = findWorkItemById(doc, localId);
  if (!item) {
    logError(`Local item not found: ${localId}`);
    process.exit(1);
  }

  // Check if linked
  if (!item._ado?.workItemId) {
    warn(`Item "${localId}" is not linked to any ADO work item`);
    process.exit(0);
  }

  const previousAdoId = item._ado.workItemId;

  // Remove ADO metadata
  delete item._ado;

  // Save file
  await writeYamlFile(file, doc);

  success(`Unlinked ${colors.bold(localId)} from ADO #${previousAdoId}`);
  info('Note: The ADO work item still exists. Only the local link was removed.');
}
