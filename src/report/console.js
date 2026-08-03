/**
 * Tableau de synthese en console, trie du pire au meilleur.
 * C'est la liste de prospection : ce qui est en haut se demarche en premier.
 */

import { renderTable } from './table.js';
import { c } from '../util/log.js';
import { bytes, seconds, score as toScore, truncate } from '../util/format.js';
import { STATUS, STATUS_LABELS } from '../audit/quick.js';
import { TIERS } from '../score/rules.js';

/** Le besoin est d'autant plus visible qu'il est eleve. */
function colorNeed(value) {
  if (value >= 70) return c.red(String(value));
  if (value >= 45) return c.yellow(String(value));
  return c.green(String(value));
}

function colorScore(value) {
  if (value == null) return c.grey('-');
  if (value < 50) return c.red(String(value));
  if (value < 90) return c.yellow(String(value));
  return c.green(String(value));
}

function colorLcp(value) {
  if (!Number.isFinite(value)) return c.grey('-');
  const text = seconds(value);
  if (value > 4000) return c.red(text);
  if (value > 2500) return c.yellow(text);
  return c.green(text);
}

export function sortRecords(records) {
  return [...records].sort((a, b) => {
    // Les sites injoignables passent en fin de liste : on ne peut rien leur
    // montrer tant qu'ils ne repondent pas.
    const aOk = a.status === STATUS.OK || a.status === STATUS.EMPTY;
    const bOk = b.status === STATUS.OK || b.status === STATUS.EMPTY;
    if (aOk !== bOk) return aOk ? -1 : 1;
    return (b.prospect?.score ?? 0) - (a.prospect?.score ?? 0);
  });
}

export function renderSummary(records) {
  const sorted = sortRecords(records);

  const rows = sorted.map((record, index) => {
    const lh = record.lighthouse?.[record.profilRetenu] ?? null;
    const injoignable = record.status !== STATUS.OK && record.status !== STATUS.EMPTY;
    const bloquants = record.consolidated?.parPalier?.[TIERS.BLOQUANT] ?? 0;

    // Un score obtenu sans Lighthouse repose sur moins de criteres. Le
    // signaler evite de comparer par erreur un lot rapide et un lot complet.
    const besoin = record.prospect?.partiel
      ? `${colorNeed(record.prospect?.score ?? 0)}${c.grey('~')}`
      : colorNeed(record.prospect?.score ?? 0);

    return {
      rang: String(index + 1),
      entreprise: truncate(record.target.name, 28),
      besoin: injoignable ? c.grey('-') : besoin,
      perf: injoignable ? c.grey('-') : colorScore(toScore(lh?.scores?.performance)),
      lcp: injoignable ? c.grey('-') : colorLcp(lh?.metrics?.lcp),
      poids: lh?.resources?.poids_total ? bytes(lh.resources.poids_total) : c.grey('-'),
      bloquants: bloquants > 0 ? c.red(String(bloquants)) : c.grey('0'),
      stack: truncate(record.quick?.summary?.stack?.resume ?? '-', 24),
      statut:
        record.status === STATUS.OK
          ? c.green('ok')
          : c.yellow(
              record.status === STATUS.HTTP_ERROR && record.detail
                ? record.detail.replace('reponse', 'HTTP')
                : (STATUS_LABELS[record.status] ?? record.status)
            ),
    };
  });

  return renderTable(
    [
      { key: 'rang', label: '#', align: 'right' },
      { key: 'entreprise', label: 'Entreprise' },
      { key: 'besoin', label: 'Besoin', align: 'right' },
      { key: 'perf', label: 'Perf', align: 'right' },
      { key: 'lcp', label: 'LCP', align: 'right' },
      { key: 'poids', label: 'Poids', align: 'right' },
      { key: 'bloquants', label: 'Bloq', align: 'right' },
      { key: 'stack', label: 'Technique' },
      { key: 'statut', label: 'Statut' },
    ],
    rows
  );
}

export function renderCounts(records) {
  const total = records.length;
  const ok = records.filter((r) => r.status === STATUS.OK).length;
  const injoignables = records.filter(
    (r) => r.status !== STATUS.OK && r.status !== STATUS.EMPTY
  ).length;
  const avecBloquants = records.filter(
    (r) => (r.consolidated?.parPalier?.[TIERS.BLOQUANT] ?? 0) > 0
  ).length;
  const avecEmail = records.filter((r) => r.target.email).length;

  return (
    `  ${c.bold(String(total))} site(s) analyse(s), ${ok} sans incident, ` +
    `${injoignables} injoignable(s)\n` +
    `  ${c.bold(String(avecBloquants))} site(s) avec au moins un constat bloquant, ` +
    `${avecEmail} avec une adresse de contact`
  );
}

/** Legende, pour que le tableau se lise sans documentation. */
export function renderLegend() {
  return (
    c.grey('  Besoin : score de prospection sur 100, du plus demandeur au moins demandeur.\n') +
    c.grey('           Le signe ~ marque un score etabli sans Lighthouse, sur moins de criteres.\n') +
    c.grey('  Perf   : score de performance Lighthouse sur le profil retenu.\n') +
    c.grey('  LCP    : delai d\'affichage du principal element. Seuil correct 2,5 s.\n') +
    c.grey('  Bloq   : constats bloquants, juridiques ou de securite.')
  );
}
