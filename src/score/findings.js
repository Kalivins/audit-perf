/**
 * Consolidation des constats et classement par impact.
 *
 * Trois sources se rejoignent ici : les controles HTML de la phase 1, les
 * audits Lighthouse, et les metriques comparees aux seuils de Google. Elles se
 * recouvrent volontairement, avec les memes identifiants, pour que la version
 * chiffree remplace la version simplement constatee.
 */

import { CWV_THRESHOLDS } from '../config.js';
import { RULES, TIER_ORDER, TIERS, TIERS_DEFAUTS, EFFORT_LABELS } from './rules.js';
import { loadCopy, render } from './copy.js';
import { ms, seconds, bytes, decimal, integer } from '../util/format.js';

/**
 * Bonus d'impact accorde a une economie mesuree, borne pour qu'un chiffre
 * spectaculaire ne fasse jamais remonter un constat au dessus de son palier.
 */
const MAX_BONUS_TIME = 40;
const MAX_BONUS_WEIGHT = 20;

function impactScore(finding, rule) {
  let score = rule.poids;
  if (Number.isFinite(finding.savingsMs)) {
    score += Math.min(MAX_BONUS_TIME, finding.savingsMs / 50);
  }
  if (Number.isFinite(finding.savingsBytes)) {
    score += Math.min(MAX_BONUS_WEIGHT, finding.savingsBytes / (50 * 1024));
  }
  return score;
}

/** Constats deduits des metriques comparees aux seuils publies par Google. */
function metricFindings(metrics) {
  const found = [];
  if (!metrics) return found;

  if (Number.isFinite(metrics.lcp) && metrics.lcp > CWV_THRESHOLDS.lcp.good) {
    found.push({
      id: 'lcp-trop-lent',
      source: 'metrique',
      savingsMs: Math.round(metrics.lcp - CWV_THRESHOLDS.lcp.good),
      savingsBytes: null,
      evidence: { lcp: metrics.lcp },
    });
  }
  if (Number.isFinite(metrics.cls) && metrics.cls > CWV_THRESHOLDS.cls.good) {
    found.push({
      id: 'cls-eleve',
      source: 'metrique',
      savingsMs: null,
      savingsBytes: null,
      evidence: { cls: metrics.cls },
    });
  }
  if (Number.isFinite(metrics.tbt) && metrics.tbt > CWV_THRESHOLDS.tbt.good) {
    found.push({
      id: 'reactivite-faible',
      source: 'metrique',
      savingsMs: null,
      savingsBytes: null,
      evidence: { tbt: metrics.tbt },
    });
  }
  return found;
}

/** Priorite de source : une economie mesuree l'emporte sur un simple constat. */
const SOURCE_RANK = { lighthouse: 3, metrique: 2, html: 1 };

function preferred(a, b) {
  const rankA = SOURCE_RANK[a.source] ?? 0;
  const rankB = SOURCE_RANK[b.source] ?? 0;

  let winner;
  if (rankA !== rankB) winner = rankA > rankB ? a : b;
  else winner = (a.savingsMs ?? 0) >= (b.savingsMs ?? 0) ? a : b;
  const loser = winner === a ? b : a;

  // Les indices des deux sources sont reunis. Lighthouse apporte l'economie
  // chiffree, le controle HTML apporte souvent le detail concret (la valeur
  // exacte d'une balise) qui rend le constat comprehensible. Jeter celui du
  // perdant privait la phrase de son element le plus parlant.
  return {
    ...winner,
    evidence: { ...(loser.evidence ?? {}), ...(winner.evidence ?? {}) },
  };
}

/**
 * Contexte de rendu des textes. Regroupe tout ce qu'un marqueur peut vouloir :
 * les indices du constat, les economies chiffrees, les metriques formatees.
 */
function buildContext(finding, metrics) {
  const context = {};

  for (const [key, value] of Object.entries(finding.evidence ?? {})) {
    context[key] = Array.isArray(value) ? value.join(', ') : value;
  }

  if (Number.isFinite(finding.savingsMs)) context.gain_temps = ms(finding.savingsMs);
  if (Number.isFinite(finding.savingsBytes)) context.gain_poids = bytes(finding.savingsBytes);

  if (metrics) {
    if (Number.isFinite(metrics.lcp)) context.lcp = seconds(metrics.lcp);
    if (Number.isFinite(metrics.cls)) context.cls = decimal(metrics.cls);
    if (Number.isFinite(metrics.tbt)) context.tbt = ms(metrics.tbt);
    if (Number.isFinite(metrics.ttfb)) context.ttfb = ms(metrics.ttfb);
  }

  if (context.elements == null && Number.isFinite(finding.evidence?.concernees)) {
    context.elements = integer(finding.evidence.concernees);
  }

  return context;
}

/**
 * @param {object} params
 * @param {object} params.quick resultat de la phase 1
 * @param {object|null} params.lh lecture Lighthouse retenue (mobile de preference)
 * @returns {Promise<{findings: array, top: array, parPalier: object, inconnus: string[]}>}
 */
export async function consolidate({ quick, lh = null, extra = [] }) {
  const metrics = lh?.metrics ?? null;

  const raw = [
    ...(quick?.findings ?? []).map((f) => ({ source: 'html', ...f })),
    ...(lh?.findings ?? []),
    ...extra,
    ...metricFindings(metrics),
  ];

  return assembleFindings(raw, metrics);
}

/**
 * Reconstruit les textes d'un enregistrement deja en cache.
 *
 * Le cache conserve des mesures : identifiants, indices, economies. Les
 * phrases francaises, elles, sont reconstruites a chaque production de
 * rapport. Sans cela, corriger une formulation dans data/copy imposerait de
 * relancer des heures de mesures, alors que la commande `report` promet
 * justement de regenerer en une seconde.
 */
export async function reconsolidate(record) {
  const lh = record.lighthouse?.[record.profilRetenu] ?? null;
  const stockes = record.consolidated?.findings ?? [];

  const raw = stockes.map((f) => ({
    id: f.id,
    source: f.source,
    savingsMs: f.savingsMs,
    savingsBytes: f.savingsBytes,
    evidence: f.evidence,
  }));

  return assembleFindings(raw, lh?.metrics ?? null);
}

async function assembleFindings(raw, metrics) {
  const copy = await loadCopy();

  // Un meme identifiant peut arriver de plusieurs sources : on garde la plus
  // informative.
  const unique = new Map();
  for (const finding of raw) {
    const existing = unique.get(finding.id);
    unique.set(finding.id, existing ? preferred(existing, finding) : finding);
  }

  const findings = [];
  const inconnus = [];

  for (const finding of unique.values()) {
    const rule = RULES[finding.id];
    if (!rule) {
      // Constat emis par un controle mais absent du catalogue : on le signale
      // plutot que de le publier sans gravite ni explication.
      inconnus.push(finding.id);
      continue;
    }

    const entry = copy[finding.id];
    const context = buildContext(finding, metrics);

    const titre = render(entry?.titre ?? finding.id, context);
    const constat = render(entry?.constat ?? '', context);
    const cout = render(entry?.cout ?? '', context);
    const correction = render(entry?.correction ?? '', context);

    findings.push({
      id: finding.id,
      tier: rule.tier,
      effort: rule.effort,
      effortLabel: EFFORT_LABELS[rule.effort],
      theme: entry?.theme ?? null,
      source: finding.source,
      savingsMs: finding.savingsMs ?? null,
      savingsBytes: finding.savingsBytes ?? null,
      evidence: finding.evidence ?? {},
      impact: impactScore(finding, rule),
      texte: {
        titre: titre.text,
        // Une phrase dont un marqueur n'a pas pu etre resolu est incomplete :
        // mieux vaut ne pas l'imprimer que livrer un constat bancal.
        constat: constat.missing.length ? null : constat.text,
        cout: cout.text,
        correction: correction.text,
        reserve: entry?.reserve ?? null,
      },
      marqueursManquants: [
        ...titre.missing,
        ...constat.missing,
        ...cout.missing,
        ...correction.missing,
      ],
    });
  }

  // Un constat etabli par observation en remplace un etabli par indice.
  const remplaces = new Set(
    findings.map((f) => RULES[f.id]?.remplace).filter(Boolean)
  );
  const retenus = findings.filter((f) => !remplaces.has(f.id));
  findings.length = 0;
  findings.push(...retenus);

  findings.sort((a, b) => {
    const tierDiff = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
    if (tierDiff !== 0) return tierDiff;
    return b.impact - a.impact;
  });

  const parPalier = {};
  for (const tier of TIER_ORDER) {
    parPalier[tier] = findings.filter((f) => f.tier === tier).length;
  }

  // Les opportunites sont tenues a l'ecart des problemes : une absence de
  // reservation en ligne n'est pas une faute, et la presenter parmi les points
  // les plus couteux dirait au client qu'il a mal fait quelque chose.
  const defauts = findings.filter((f) => TIERS_DEFAUTS.includes(f.tier));
  const opportunites = findings.filter((f) => f.tier === TIERS.OPPORTUNITE);

  return {
    findings,
    defauts,
    opportunites,
    top: defauts.slice(0, 5),
    parPalier,
    inconnus: [...new Set(inconnus)],
    bloquants: parPalier[TIERS.BLOQUANT] ?? 0,
  };
}
