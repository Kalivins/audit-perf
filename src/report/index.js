/**
 * Page d'entree du dossier de sortie.
 *
 * Seize fichiers HTML dans un dossier ne se parcourent pas. Cette page donne
 * la synthese triee, les memes chiffres que la console, et un lien vers chaque
 * rapport. C'est aussi elle qu'on ouvre pour choisir qui demarcher.
 *
 * Elle reste interne : elle porte le score de prospection, qui n'a rien a
 * faire sous les yeux d'un client.
 */

import { page, etiquette, couleurScore } from './template.js';
import {
  escapeHtml, seconds, bytes, score as toScore, frenchDate, truncate,
} from '../util/format.js';
import { sortRecords } from './console.js';
import { STATUS, STATUS_LABELS } from '../audit/quick.js';
import { TIERS } from '../score/rules.js';

const STYLE_SUPPLEMENT = `
.sommaire { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin: 1.5rem 0; }
.sommaire th, .sommaire td { padding: 0.55rem 0.6rem; border-bottom: 1px solid var(--trait);
  text-align: left; vertical-align: top; }
.sommaire th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--encre-douce); font-weight: 600; white-space: nowrap; }
.sommaire td.nombre { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sommaire tr:last-child td { border-bottom: none; }
.sommaire a { color: var(--accent); text-decoration: none; font-weight: 600; }
.sommaire a:hover { text-decoration: underline; }
.sommaire .secteur { display: block; color: var(--encre-douce); font-size: 0.8rem; }
.sommaire .accroche { color: var(--encre-douce); font-size: 0.82rem; }
.besoin { font-weight: 700; font-variant-numeric: tabular-nums; }
.chiffres { display: flex; flex-wrap: wrap; gap: 2rem; margin: 1.5rem 0 0; }
.chiffres div { flex: 0 0 auto; }
.chiffres .valeur { font-size: 1.9rem; font-weight: 700; line-height: 1.1; }
.chiffres .quoi { font-size: 0.78rem; color: var(--encre-douce); text-transform: uppercase;
  letter-spacing: 0.06em; }
.hors-service td { color: var(--encre-douce); }
`;

function couleurBesoin(valeur) {
  if (valeur >= 60) return 'var(--rouge)';
  if (valeur >= 35) return 'var(--orange)';
  return 'var(--vert)';
}

function ligne(record, index, chemin) {
  const lh = record.lighthouse?.[record.profilRetenu] ?? null;
  const horsService = record.status !== STATUS.OK && record.status !== STATUS.EMPTY;
  const bloquants = record.consolidated?.parPalier?.[TIERS.BLOQUANT] ?? 0;
  const perf = toScore(lh?.scores?.performance);

  const nom = chemin
    ? `<a href="${escapeHtml(chemin.replace(/\\/g, '/'))}">${escapeHtml(record.target.name)}</a>`
    : escapeHtml(record.target.name);

  const statut =
    record.status === STATUS.HTTP_ERROR && record.detail
      ? record.detail.replace('reponse', 'HTTP')
      : (STATUS_LABELS[record.status] ?? record.status);

  if (horsService) {
    return `<tr class="hors-service">
      <td class="nombre">${index + 1}</td>
      <td>${nom}<span class="secteur">${escapeHtml(record.target.sector ?? '')}</span></td>
      <td class="nombre">-</td><td class="nombre">-</td><td class="nombre">-</td>
      <td class="nombre">-</td><td class="nombre">-</td><td class="nombre">-</td>
      <td>-</td><td>${escapeHtml(statut)}</td>
    </tr>`;
  }

  return `<tr>
    <td class="nombre">${index + 1}</td>
    <td>${nom}<span class="secteur">${escapeHtml(record.target.sector ?? '')}</span>
      <span class="accroche">${escapeHtml(record.prospect?.accroche ?? '')}</span></td>
    <td class="nombre"><span class="besoin" style="color:${couleurBesoin(record.prospect?.score ?? 0)}"
      >${record.prospect?.score ?? '-'}${record.prospect?.partiel ? '~' : ''}</span></td>
    <td class="nombre" style="color:${couleurScore(perf)}">${perf ?? '-'}</td>
    <td class="nombre">${escapeHtml(lh?.metrics?.lcp ? seconds(lh.metrics.lcp) : '-')}</td>
    <td class="nombre">${escapeHtml(lh?.resources?.poids_total ? bytes(lh.resources.poids_total) : '-')}</td>
    <td class="nombre">${bloquants > 0 ? `<strong style="color:var(--rouge)">${bloquants}</strong>` : '0'}</td>
    <td class="nombre">${record.consolidated?.opportunites?.length ?? 0}</td>
    <td>${escapeHtml(
      (record.quick?.summary?.automatisation?.manquants_libelles ?? []).join(', ') || '-'
    )}</td>
    <td>${escapeHtml(truncate(record.quick?.summary?.stack?.resume ?? '-', 22))}</td>
  </tr>`;
}

/**
 * @param {array} records
 * @param {Map<string,string>} reports identifiant de cible -> chemin relatif
 */
export function buildIndex(records, reports = new Map()) {
  const tries = sortRecords(records);

  const mesures = tries.filter((r) => r.status === STATUS.OK || r.status === STATUS.EMPTY);
  const horsService = tries.length - mesures.length;
  const avecBloquants = tries.filter(
    (r) => (r.consolidated?.parPalier?.[TIERS.BLOQUANT] ?? 0) > 0
  ).length;
  const avecEmail = tries.filter((r) => r.target.email).length;

  const lignes = tries
    .map((record, index) => ligne(record, index, reports.get(record.target.id)))
    .join('\n');

  const corps = `<header class="entete">
  <div class="surtitre">Document interne de prospection</div>
  <h1>${tries.length} sites analysés</h1>
  <div class="date">Dernière analyse le ${escapeHtml(frenchDate(tries[0]?.checkedAt))}</div>
</header>

<div class="chiffres">
  <div><div class="valeur">${mesures.length}</div><div class="quoi">Mesurés</div></div>
  <div><div class="valeur" style="color:var(--rouge)">${avecBloquants}</div>
    <div class="quoi">Avec un bloquant</div></div>
  <div><div class="valeur">${avecEmail}</div><div class="quoi">Avec un contact</div></div>
  <div><div class="valeur" style="color:var(--encre-douce)">${horsService}</div>
    <div class="quoi">Injoignables</div></div>
</div>

<table class="sommaire">
  <thead><tr>
    <th>#</th><th>Entreprise</th><th>Besoin</th><th>Perf</th>
    <th>LCP</th><th>Poids</th><th>Bloq.</th><th>Opp.</th>
    <th>À automatiser</th><th>Technique</th>
  </tr></thead>
  <tbody>${lignes}</tbody>
</table>

<div class="note">
  <p><strong>Besoin</strong> : score de prospection sur 100, du plus demandeur au moins
  demandeur. Il ne mesure pas la qualité d'un site mais le besoin qu'a cette entreprise
  d'être appelée. Le signe ~ marque un score établi sans Lighthouse, sur moins de critères.
  Ce score n'apparaît dans aucun rapport client.</p>
  <p><strong>LCP</strong> : délai d'affichage du principal élément sur mobile.
  Seuil correct de 2,5 s publié par Google.</p>
  <p><strong>Opp.</strong> : opportunités d'automatisation, c'est à dire ce que le
  métier fait couramment en ligne et que ce site ne fait pas. Ce ne sont pas des
  défauts : elles sont présentées à part dans le rapport client, comme des
  propositions et non comme des reproches.</p>
  <p>Cliquer sur un nom ouvre le rapport destiné à cette entreprise.</p>
</div>`;

  const html = page({ titre: `Prospection : ${tries.length} sites analysés`, corps });
  return html.replace('</style>', `${STYLE_SUPPLEMENT}</style>`);
}
