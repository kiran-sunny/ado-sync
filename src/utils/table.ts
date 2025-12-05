/**
 * Table formatting utilities
 */

import pc from 'picocolors';

export interface TableColumn {
  header: string;
  key: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  format?: (value: unknown) => string;
}

export interface TableOptions {
  columns: TableColumn[];
  border?: boolean;
  headerColor?: (text: string) => string;
}

/**
 * Simple table renderer
 */
export function renderTable(
  data: Record<string, unknown>[],
  options: TableOptions
): string {
  const { columns, border = true, headerColor = pc.bold } = options;

  // Calculate column widths
  const widths = columns.map(col => {
    const headerWidth = col.header.length;
    const dataWidth = Math.max(
      ...data.map(row => {
        const value = row[col.key];
        const formatted = col.format ? col.format(value) : String(value ?? '');
        // Strip ANSI codes for width calculation
        return stripAnsi(formatted).length;
      }),
      0
    );
    return col.width ?? Math.max(headerWidth, dataWidth);
  });

  const lines: string[] = [];

  // Border characters
  const h = border ? '─' : '';
  const v = border ? '│' : ' ';
  const tl = border ? '┌' : '';
  const tr = border ? '┐' : '';
  const bl = border ? '└' : '';
  const br = border ? '┘' : '';
  const ml = border ? '├' : '';
  const mr = border ? '┤' : '';
  const mt = border ? '┬' : '';
  const mb = border ? '┴' : '';
  const mm = border ? '┼' : '';

  // Top border
  if (border) {
    lines.push(tl + widths.map(w => h.repeat(w + 2)).join(mt) + tr);
  }

  // Header
  const headerCells = columns.map((col, i) => {
    const text = headerColor(col.header);
    return padCell(text, col.header.length, widths[i]!, col.align ?? 'left');
  });
  lines.push(v + ' ' + headerCells.join(' ' + v + ' ') + ' ' + v);

  // Header separator
  if (border) {
    lines.push(ml + widths.map(w => h.repeat(w + 2)).join(mm) + mr);
  }

  // Data rows
  for (const row of data) {
    const cells = columns.map((col, i) => {
      const value = row[col.key];
      const formatted = col.format ? col.format(value) : String(value ?? '');
      const textLength = stripAnsi(formatted).length;
      return padCell(formatted, textLength, widths[i]!, col.align ?? 'left');
    });
    lines.push(v + ' ' + cells.join(' ' + v + ' ') + ' ' + v);
  }

  // Bottom border
  if (border) {
    lines.push(bl + widths.map(w => h.repeat(w + 2)).join(mb) + br);
  }

  return lines.join('\n');
}

/**
 * Pad cell content to width
 */
function padCell(
  text: string,
  textLength: number,
  width: number,
  align: 'left' | 'right' | 'center'
): string {
  const padding = width - textLength;

  if (padding <= 0) {
    return text;
  }

  switch (align) {
    case 'right':
      return ' '.repeat(padding) + text;
    case 'center':
      const left = Math.floor(padding / 2);
      const right = padding - left;
      return ' '.repeat(left) + text + ' '.repeat(right);
    default:
      return text + ' '.repeat(padding);
  }
}

/**
 * Strip ANSI escape codes from string
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;;[^\x07]*\x07[^\x1b]*\x1b\]8;;\x07/g, (match) => {
    // Extract display text from hyperlink
    const parts = match.split('\x07');
    return parts[1]?.replace(/\x1b\]8;;\x07$/, '') ?? '';
  });
}

/**
 * Simple key-value list renderer
 */
export function renderKeyValue(data: Record<string, unknown>, indent = 0): string {
  const prefix = ' '.repeat(indent);
  const lines: string[] = [];

  const maxKeyLength = Math.max(...Object.keys(data).map(k => k.length));

  for (const [key, value] of Object.entries(data)) {
    const paddedKey = key.padEnd(maxKeyLength);
    const formattedValue = typeof value === 'object'
      ? JSON.stringify(value)
      : String(value ?? pc.dim('(not set)'));
    lines.push(`${prefix}${pc.dim(paddedKey)}  ${formattedValue}`);
  }

  return lines.join('\n');
}
