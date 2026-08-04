/**
 * Export CSV : la liste de prospection.
 *
 * Ecrit avec le point-virgule et un BOM UTF-8, parce que la destination
 * probable est Excel en locale francaise, qui sans cela met tout dans une
 * seule colonne et mange les accents. Le separateur reste modifiable.
 */

import { writeFile } from 'node:fs/promises';
import { stringify } from 'csv-stringify/sync';
import { sortRecords } from './console.js';
import { STATUS, STATUS_LABELS } from '../audit/quick.js';
import { TIERS } from '../score/rules.js';
import { score as toScore } from '../util/format.js';

const BOM = String.fromCharCode(0xfeff);

const COLONNES = [
  'rang',
  'entreprise',
  'url',
  'secteur',
  'email',
  'besoin',
  'besoin_partiel',
  'statut',
  'accroche',
  'bloquants',
  'couteux',
  'a_corriger',
  'opportunites',
  'automatisation_en_place',
  'automatisation_manquante',
  'rang_secteur',
  'ua_repli',
  'pages_auditees',
  'pages_site',
  'liens_morts',
  'cookies_traceurs',
  'cert_jours_restants',
  'spf',
  'dmarc',
  'fiche_locale',
  'perf_mobile',
  'perf_bureau',
  'accessibilite',
  'seo',
  'lcp_mobile_s',
  'cls',
  'tbt_ms',
  'ttfb_ms',
  'poids_ko',
  'requetes',
  'poids_evitable_ko',
  'mentions_legales',
  'confidentialite',
  'traceurs',
  'consentement',
  'cms',
  'serveur',
  'php',
  'probleme_1',
  'probleme_2',
  'probleme_3',
  'rapport',
  'analyse_le',
];

const ETAT_LEGAL = {
  ok: 'presentes',
  dans_la_page: 'dans la page',
  absent: 'ABSENTES',
  casse: 'LIEN CASSE',
  injoignable: 'injoignable',
};

const round = (value, digits = 0) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : '';

function ligne(record, index, reportPath) {
  const lh = record.lighthouse?.[record.profilRetenu] ?? null;
  const bureau = record.lighthouse?.desktop ?? null;
  const palier = record.consolidated?.parPalier ?? {};
  const legal = record.quick?.summary?.legal ?? {};
  const stack = record.quick?.summary?.stack ?? {};
  const traceurs = record.quick?.summary?.traceurs ?? {};
  const auto = record.quick?.summary?.automatisation ?? null;
  const dns = record.quick?.summary?.dns?.disponible ? record.quick.summary.dns : null;
  const structurees = record.quick?.summary?.donnees_structurees ?? null;
  const top = record.consolidated?.top ?? [];

  return {
    rang: index + 1,
    entreprise: record.target.name,
    url: record.target.url,
    secteur: record.target.sector ?? '',
    email: record.target.email ?? '',
    besoin: record.prospect?.score ?? '',
    besoin_partiel: record.prospect?.partiel ? 'oui' : 'non',
    statut:
      record.status === STATUS.HTTP_ERROR && record.detail
        ? record.detail.replace('reponse', 'HTTP')
        : (STATUS_LABELS[record.status] ?? record.status),
    accroche: record.prospect?.accroche ?? '',
    bloquants: palier[TIERS.BLOQUANT] ?? 0,
    couteux: palier[TIERS.COUTEUX] ?? 0,
    a_corriger: palier[TIERS.CORRIGER] ?? 0,
    opportunites: record.consolidated?.opportunites?.length ?? 0,
    automatisation_en_place: (auto?.en_place ?? []).join(' | '),
    automatisation_manquante: (auto?.manquants ?? []).join(' | '),
    rang_secteur: record.comparaison
      ? `${record.comparaison.rang}/${record.comparaison.total}`
      : '',
    ua_repli: record.quick?.summary?.ua_repli ? 'oui' : '',
    pages_auditees: record.quick?.summary?.pages?.examinees ?? '',
    pages_site: record.quick?.summary?.sitemap?.pages ?? '',
    liens_morts: record.quick?.summary?.liens?.morts?.length ?? '',
    cookies_traceurs: record.cookies?.disponible
      ? record.cookies.traceurs.length
      : '',
    cert_jours_restants: record.quick?.summary?.certificat?.jours_restants ?? '',
    spf: dns ? (dns.spf ? 'oui' : 'NON') : '',
    dmarc: dns ? (dns.dmarc ? (dns.politique_dmarc ?? 'oui') : 'NON') : '',
    fiche_locale: structurees ? (structurees.fiche_locale ? 'oui' : 'NON') : '',
    perf_mobile: toScore(lh?.scores?.performance) ?? '',
    perf_bureau: toScore(bureau?.scores?.performance) ?? '',
    accessibilite: toScore(lh?.scores?.accessibilite) ?? '',
    seo: toScore(lh?.scores?.seo) ?? '',
    lcp_mobile_s: round(lh?.metrics?.lcp / 1000, 2),
    cls: round(lh?.metrics?.cls, 3),
    tbt_ms: round(lh?.metrics?.tbt),
    ttfb_ms: round(lh?.metrics?.ttfb),
    poids_ko: round(lh?.resources?.poids_total / 1024),
    requetes: lh?.resources?.requetes ?? '',
    poids_evitable_ko: round(record.gains?.poids?.evitable_octets / 1024),
    mentions_legales: ETAT_LEGAL[legal.mentions?.state] ?? '',
    confidentialite: ETAT_LEGAL[legal.privacy?.state] ?? '',
    traceurs: (traceurs.trackers ?? []).join(' | '),
    consentement: (traceurs.consent ?? []).join(' | '),
    cms: stack.cms ?? '',
    serveur: stack.serveur ?? '',
    php: stack.php ?? '',
    probleme_1: top[0]?.texte?.titre ?? '',
    probleme_2: top[1]?.texte?.titre ?? '',
    probleme_3: top[2]?.texte?.titre ?? '',
    rapport: reportPath ?? '',
    analyse_le: record.checkedAt ? record.checkedAt.slice(0, 10) : '',
  };
}

/**
 * @param {array} records
 * @param {string} file chemin du CSV a ecrire
 * @param {{delimiter?: string, reports?: Map<string,string>}} options
 */
export async function writeProspectCsv(records, file, options = {}) {
  const { delimiter = ';', reports = new Map() } = options;
  const sorted = sortRecords(records);

  const rows = sorted.map((record, index) =>
    ligne(record, index, reports.get(record.target.id))
  );

  const csv = stringify(rows, {
    header: true,
    columns: COLONNES,
    delimiter,
    // Le point decimal reste le separateur des nombres. Excel en locale
    // francaise attend la virgule, mais l'ecrire ici entrerait en conflit avec
    // le point-virgule et casserait les colonnes des la premiere decimale.
    cast: {
      number: (value) => String(value),
    },
  });

  await writeFile(file, BOM + csv, 'utf8');
  return { file, lignes: rows.length };
}
