/**
 * Rendu de tableaux alignes en console. Partage par la commande `check` et
 * par le tableau de synthese, pour que les deux aient la meme allure.
 */

import { padEnd, padStart, visibleLength } from '../util/format.js';
import { c } from '../util/log.js';

/**
 * @param {Array<{key: string, label: string, align?: 'left'|'right'}>} columns
 * @param {Array<Object<string, string>>} rows valeurs deja formatees en chaines
 */
export function renderTable(columns, rows) {
  if (!rows.length) return '';

  const widths = columns.map((col) =>
    Math.max(
      visibleLength(col.label),
      ...rows.map((row) => visibleLength(row[col.key] ?? ''))
    )
  );

  const pad = (text, index) =>
    columns[index].align === 'right'
      ? padStart(text, widths[index])
      : padEnd(text, widths[index]);

  const lines = [];

  lines.push(
    '  ' + columns.map((col, i) => c.bold(pad(col.label, i))).join('  ')
  );
  lines.push('  ' + widths.map((w) => c.grey('-'.repeat(w))).join('  '));

  for (const row of rows) {
    lines.push(
      '  ' + columns.map((col, i) => pad(row[col.key] ?? '', i)).join('  ')
    );
  }

  return lines.join('\n');
}
