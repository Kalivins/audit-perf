/**
 * Formatage a destination des rapports clients. Conventions francaises :
 * virgule decimale, espace insecable avant les unites.
 */

const NBSP = ' ';

/** 1834 -> "1,8 s" ; 420 -> "420 ms" */
export function ms(value) {
  if (value == null || !Number.isFinite(value)) return '-';
  if (value < 1000) return `${Math.round(value)}${NBSP}ms`;
  const s = value / 1000;
  return `${s.toFixed(s < 10 ? 1 : 0).replace('.', ',')}${NBSP}s`;
}

/** Toujours en secondes, pour les metriques type LCP. */
export function seconds(value) {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${(value / 1000).toFixed(1).replace('.', ',')}${NBSP}s`;
}

/** 2415919 -> "2,3 Mo" */
export function bytes(value) {
  if (value == null || !Number.isFinite(value)) return '-';
  if (value < 1024) return `${Math.round(value)}${NBSP}o`;
  const ko = value / 1024;
  if (ko < 1024) return `${Math.round(ko)}${NBSP}ko`;
  return `${(ko / 1024).toFixed(1).replace('.', ',')}${NBSP}Mo`;
}

/** Duree en secondes, basculant en minutes au dela de 60 s : 319,7 -> "5 min 20 s" */
export function duree(secondes) {
  if (!Number.isFinite(secondes)) return '-';
  if (secondes < 60) return `${secondes.toFixed(1).replace('.', ',')}${NBSP}s`;
  const minutes = Math.floor(secondes / 60);
  const reste = Math.round(secondes % 60);
  return reste
    ? `${minutes}${NBSP}min${NBSP}${reste}${NBSP}s`
    : `${minutes}${NBSP}min`;
}

/** 0.083 -> "0,083" (CLS, sans unite) */
export function decimal(value, digits = 3) {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toFixed(digits).replace('.', ',');
}

/** 0.62 -> 62 (score Lighthouse ramene sur 100) */
export function score(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** 12500 -> "12 500" */
export function integer(value) {
  if (value == null || !Number.isFinite(value)) return '-';
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/**
 * Tronque pour les colonnes de tableau.
 *
 * Points de suspension en ASCII plutot que le caractere unique : la console
 * Windows n'est pas en UTF-8 par defaut et affichait des caracteres parasites
 * a la place. Le rapport HTML, lui, declare son encodage et n'a pas ce souci.
 */
export function truncate(text, max) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 3)).trimEnd() + '...';
}

/**
 * Les codes couleur ANSI ne prennent pas de place a l'ecran. On les retire
 * avant de calculer une largeur, sinon les colonnes se decalent des qu'une
 * cellule est coloree.
 */
const ANSI = new RegExp(String.fromCharCode(27) + '\\[\\d+m', 'g');

export function visibleLength(text) {
  return String(text).replace(ANSI, '').length;
}

export function padEnd(text, width) {
  return text + ' '.repeat(Math.max(0, width - visibleLength(text)));
}

export function padStart(text, width) {
  return ' '.repeat(Math.max(0, width - visibleLength(text))) + text;
}

/** Date lisible pour l'en-tete du rapport. */
export function frenchDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Echappement HTML pour tout ce qui provient du site audite. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
