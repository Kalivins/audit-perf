/**
 * Lecture des fichiers de cibles (CSV ou TXT).
 *
 * Le format nominal est : nom_entreprise, url, secteur, email, trafic_mensuel
 * mais en pratique les fichiers arrivent d'Excel, de Pages Jaunes ou d'un
 * copier-coller. On tolere donc :
 *   - le point-virgule comme separateur (export Excel en locale francaise)
 *   - la tabulation (copier-coller depuis un tableur)
 *   - le BOM UTF-8 en tete de fichier (Excel encore)
 *   - l'absence de ligne d'en-tete
 *   - des colonnes dans le desordre, ou une seule colonne d'URL
 *   - les lignes vides et les commentaires commencant par #
 */

import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { shortHash, targetSlug } from '../util/hash.js';

/** Noms de colonnes acceptes, en minuscules et sans accent. */
const HEADER_ALIASES = {
  name: ['nom_entreprise', 'nom', 'entreprise', 'societe', 'raison_sociale', 'name', 'company'],
  url: ['url', 'site', 'site_web', 'siteweb', 'website', 'lien', 'adresse', 'domaine'],
  sector: ['secteur', 'activite', 'metier', 'categorie', 'sector', 'industry'],
  email: ['email', 'e_mail', 'mail', 'courriel', 'contact'],
  traffic: ['trafic_mensuel', 'trafic', 'visites', 'visiteurs', 'traffic', 'monthly_traffic'],
};

/** Ordre positionnel utilise quand le fichier n'a pas d'en-tete. */
const POSITIONAL = ['name', 'url', 'sector', 'email', 'traffic'];

function deaccent(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function canonicalField(header) {
  const key = deaccent(header).replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(key)) return field;
  }
  return null;
}

/**
 * Devine le separateur en comptant les candidats hors guillemets sur la
 * premiere ligne utile. Sans ca, un export Excel francais donne une seule
 * colonne contenant tout, et l'outil croit avoir lu des URL invalides.
 */
export function sniffDelimiter(text) {
  const line = text
    .split(/\r?\n/)
    .find((l) => l.trim() && !l.trim().startsWith('#'));
  if (!line) return ',';

  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }

  let best = ',';
  for (const [ch, n] of Object.entries(counts)) {
    if (n > counts[best]) best = ch;
  }
  return counts[best] > 0 ? best : ',';
}

/**
 * Normalise une URL saisie a la main.
 *
 * Attention : en l'absence de schema on prefixe https, mais cela ne prejuge
 * pas de la disponibilite reelle du HTTPS. La verification correspondante
 * sonde les deux schemas ; un site joignable en http seulement doit ressortir
 * comme non conforme, pas comme injoignable.
 */
export function normalizeUrl(input) {
  let raw = String(input ?? '').trim().replace(/^["']|["']$/g, '');
  if (!raw) return null;

  if (raw.startsWith('//')) raw = `https:${raw}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.') || url.hostname.endsWith('.')) return null;

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname === '/' && !url.search) return `${url.origin}/`;
  return url.toString();
}

function parseTraffic(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseEmail(value) {
  const s = String(value ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

/** Detecte si la premiere ligne est un en-tete plutot qu'une donnee. */
function looksLikeHeader(row) {
  const named = row.filter((cell) => canonicalField(cell)).length;
  const hasUrl = row.some((cell) => /^https?:\/\//i.test(String(cell).trim()));
  return named >= 2 && !hasUrl;
}

function buildColumnMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const field = canonicalField(cell);
    if (field && !(field in map)) map[field] = index;
  });
  return map;
}

/**
 * Cas frequent : une colonne unique par ligne. Elle contient l'URL, et le nom
 * de l'entreprise sera deduit du domaine.
 */
function singleColumnMap() {
  return { url: 0 };
}

function nameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Lit un fichier de cibles et retourne { targets, rejected }.
 * Aucune exception n'est levee pour une ligne invalide : elle part dans
 * `rejected` avec sa raison, pour etre affichee a l'utilisateur.
 */
export async function loadTargets(filePath, { limit = null } = {}) {
  let text = await readFile(filePath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const delimiter = sniffDelimiter(text);

  // `info: true` donne le vrai numero de ligne dans le fichier. Sans lui, les
  // commentaires et les lignes vides decalent la numerotation et l'utilisateur
  // qui corrige sa liste regarde la mauvaise ligne.
  const records = parse(text, {
    delimiter,
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
    comment: '#',
    info: true,
  }).filter(({ record }) => record.some((cell) => String(cell).trim()));

  if (!records.length) {
    return { targets: [], rejected: [], delimiter, hasHeader: false };
  }

  const headerRow = records[0].record;
  const hasHeader = looksLikeHeader(headerRow);
  const dataRecords = hasHeader ? records.slice(1) : records;

  let columns;
  if (hasHeader) {
    columns = buildColumnMap(headerRow);
  } else if (headerRow.length === 1) {
    columns = singleColumnMap();
  } else {
    columns = {};
    POSITIONAL.forEach((field, index) => {
      if (index < headerRow.length) columns[field] = index;
    });
  }

  if (!('url' in columns)) {
    throw new Error(
      `Aucune colonne d'URL trouvee dans ${filePath}. ` +
        `Attendu un en-tete nomme "url" ou "site", ou l'URL en deuxieme colonne.`
    );
  }

  const targets = [];
  const rejected = [];
  const seen = new Map();

  for (const { record: row, info } of dataRecords) {
    const lineNumber = info.lines;
    const cell = (field) =>
      columns[field] == null ? '' : String(row[columns[field]] ?? '').trim();

    const rawUrl = cell('url');
    const url = normalizeUrl(rawUrl);

    if (!url) {
      rejected.push({
        line: lineNumber,
        raw: rawUrl || row.join(delimiter),
        reason: rawUrl ? 'URL invalide' : 'URL absente',
      });
      continue;
    }

    if (seen.has(url)) {
      rejected.push({
        line: lineNumber,
        raw: rawUrl,
        reason: `doublon de la ligne ${seen.get(url)}`,
      });
      continue;
    }
    seen.set(url, lineNumber);

    const name = cell('name') || nameFromUrl(url);
    targets.push({
      id: shortHash(url),
      slug: targetSlug(name, url),
      name,
      url,
      sector: cell('sector') || null,
      email: parseEmail(cell('email')),
      monthlyTraffic: parseTraffic(cell('traffic')),
      line: lineNumber,
    });

    if (limit && targets.length >= limit) break;
  }

  return { targets, rejected, delimiter, hasHeader };
}
