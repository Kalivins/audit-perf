/**
 * Obligations legales francaises verifiables depuis la page d'accueil.
 *
 * Mentions legales : article 6 III de la LCEN, obligatoire pour tout site
 * professionnel. Politique de confidentialite : exigee des lors que le site
 * traite des donnees personnelles, ce qui couvre le moindre formulaire de
 * contact ou le moindre traceur.
 *
 * Deux precautions pour ne pas produire de faux constats sur un rapport
 * facture :
 *   - un lien trouve est reellement sollicite, un lien casse est un constat
 *     different d'un lien absent
 *   - les sites d'une seule page portent souvent ces mentions dans le pied de
 *     page plutot que derriere un lien, cas detecte separement
 */

import { probe } from '../../net/http.js';
import { hostOf } from '../../net/politeness.js';

const PATTERNS = {
  mentions:
    /mentions?[\s_-]*legales?|informations?[\s_-]*legales?|impressum|(^|[\s_/-])legal([\s_/-]|$)/,
  privacy:
    /confidentialite|donnees[\s_-]*personnelles|vie[\s_-]*privee|privacy|politique[\s_-]*de[\s_-]*protection|\brgpd\b|\bgdpr\b/,
};

/** Indices qu'un texte de pied de page tient lieu de mentions legales. */
const INLINE_LEGAL_MARKERS =
  /\bsiret\b|\bsiren\b|\brcs\b|\bape\b|\btva[\s_-]*intracommunautaire\b|directeur[\s_-]*de[\s_-]*la[\s_-]*publication|hebergeur/;

function deaccent(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Collecte les liens candidats pour chaque categorie, sans doublon. */
function collectCandidates(dom, baseUrl) {
  const found = { mentions: [], privacy: [] };
  const seen = new Set();

  for (const anchor of dom.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) {
      continue;
    }

    let resolved;
    try {
      resolved = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(resolved)) continue;

    const haystack = deaccent(`${anchor.text} ${href}`);
    for (const [key, pattern] of Object.entries(PATTERNS)) {
      if (pattern.test(haystack)) {
        seen.add(resolved);
        found[key].push({ url: resolved, label: anchor.text.trim().slice(0, 80) });
        break;
      }
    }
  }

  return found;
}

/** Le contenu figure-t-il directement dans la page ? Cas des sites une page. */
function looksInline(dom, key) {
  const text = deaccent(dom.text || '');
  if (!PATTERNS[key].test(text)) return false;
  return key === 'mentions' ? INLINE_LEGAL_MARKERS.test(text) : true;
}

async function verifyCandidates(candidates, { scheduler, httpOptions }) {
  // Deux tentatives au maximum : au dela on sollicite le serveur pour rien.
  for (const candidate of candidates.slice(0, 2)) {
    const response = await scheduler.run(hostOf(candidate.url), () =>
      probe(candidate.url, httpOptions)
    );
    if (response.ok) {
      return { state: 'ok', url: candidate.url, label: candidate.label };
    }
    if (!response.error) {
      return {
        state: 'casse',
        url: candidate.url,
        label: candidate.label,
        status: response.status,
      };
    }
  }
  return { state: 'injoignable', url: candidates[0]?.url ?? null };
}

export async function checkLegal({ dom, baseUrl, scheduler, httpOptions }) {
  const findings = [];
  const candidates = collectCandidates(dom, baseUrl);
  const summary = { mentions: null, privacy: null };

  for (const key of ['mentions', 'privacy']) {
    const list = candidates[key];

    if (!list.length) {
      if (looksInline(dom, key)) {
        summary[key] = { state: 'dans_la_page', url: null };
        continue;
      }
      summary[key] = { state: 'absent', url: null };
      findings.push({
        id: key === 'mentions' ? 'mentions-legales-absentes' : 'confidentialite-absente',
        evidence: { liens_examines: dom.querySelectorAll('a[href]').length },
      });
      continue;
    }

    const verdict = await verifyCandidates(list, { scheduler, httpOptions });
    summary[key] = verdict;

    if (verdict.state === 'casse') {
      findings.push({
        id: key === 'mentions' ? 'mentions-legales-cassees' : 'confidentialite-cassee',
        evidence: { url: verdict.url, statut: verdict.status },
      });
    }
  }

  return { findings, summary };
}
