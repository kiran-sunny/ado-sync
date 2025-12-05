/**
 * Color utilities using picocolors
 */

import pc from 'picocolors';

export const colors = {
  // Status colors
  success: pc.green,
  error: pc.red,
  warning: pc.yellow,
  info: pc.blue,
  dim: pc.dim,
  bold: pc.bold,

  // Work item types
  epic: pc.magenta,
  feature: pc.cyan,
  pbi: pc.blue,
  task: pc.green,
  bug: pc.red,

  // Sync status
  synced: pc.green,
  pending: pc.yellow,
  conflict: pc.red,
  new: pc.cyan,
  modified: pc.yellow,
  deleted: pc.red,

  // Actions
  create: pc.green,
  update: pc.yellow,
  skip: pc.dim,
  delete: pc.red,
};

/**
 * Format work item type with color
 */
export function formatType(type: string): string {
  const typeColors: Record<string, (text: string) => string> = {
    Epic: colors.epic,
    Feature: colors.feature,
    'Product Backlog Item': colors.pbi,
    'User Story': colors.pbi,
    Task: colors.task,
    Bug: colors.bug,
  };

  const colorFn = typeColors[type] ?? pc.white;
  return colorFn(type);
}

/**
 * Format sync action with color
 */
export function formatAction(action: string): string {
  const actionColors: Record<string, (text: string) => string> = {
    create: colors.create,
    update: colors.update,
    skip: colors.skip,
    delete: colors.delete,
    conflict: colors.conflict,
  };

  const colorFn = actionColors[action] ?? pc.white;
  return colorFn(action);
}

/**
 * Format sync status with color
 */
export function formatStatus(status: string): string {
  const statusColors: Record<string, (text: string) => string> = {
    synced: colors.synced,
    pending: colors.pending,
    conflict: colors.conflict,
    new: colors.new,
    modified: colors.modified,
    deleted: colors.deleted,
  };

  const colorFn = statusColors[status] ?? pc.white;
  return colorFn(status);
}

/**
 * Format URL as clickable link (terminal hyperlink)
 */
export function formatUrl(url: string, text?: string): string {
  // OSC 8 hyperlink format for terminals that support it
  const displayText = text ?? url;
  return `\x1b]8;;${url}\x07${pc.underline(pc.blue(displayText))}\x1b]8;;\x07`;
}

/**
 * Format ID with dimmed prefix
 */
export function formatId(id: string | number, prefix?: string): string {
  if (prefix) {
    return `${pc.dim(prefix)}${pc.bold(String(id))}`;
  }
  return pc.bold(String(id));
}

export { pc };
