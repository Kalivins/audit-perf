/**
 * Detection du CMS et de la technique employee.
 *
 * Utile des deux cotes : en prospection, savoir qu'un site tourne sous
 * WordPress indique tout de suite l'ampleur du chantier ; dans le rapport, la
 * mention reste sobre et sert a montrer qu'on a regarde sous le capot.
 *
 * Les empreintes vivent dans data/fingerprints.json pour etre completees sans
 * toucher au code.
 */

import { readFile } from 'node:fs/promises';

const FINGERPRINTS_URL = new URL('../../../data/fingerprints.json', import.meta.url);

/** Versions de PHP sans support securite. PHP 8.0 a pris fin en novembre 2023. */
const PHP_END_OF_LIFE = /^([0-7]\.|8\.0)/;

let cached = null;

async function fingerprints() {
  if (!cached) {
    const raw = await readFile(FINGERPRINTS_URL, 'utf8');
    cached = JSON.parse(raw).technologies;
  }
  return cached;
}

function metaGenerator(html) {
  const match = html.match(
    /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i
  );
  return match ? match[1] : '';
}

function matches(tech, { haystack, generator, headers }) {
  if (Array.isArray(tech.html) && tech.html.some((needle) => haystack.includes(needle.toLowerCase()))) {
    return true;
  }
  if (tech.generator && generator.includes(tech.generator.toLowerCase())) {
    return true;
  }
  if (tech.header) {
    const value = headers[tech.header.nom.toLowerCase()];
    if (value != null) {
      const needle = (tech.header.contient || '').toLowerCase();
      // Une chaine vide signifie que la seule presence de l'en-tete suffit.
      if (!needle || String(value).toLowerCase().includes(needle)) return true;
    }
  }
  return false;
}

function extractVersion(tech, sources) {
  if (!tech.version) return null;
  let regex;
  try {
    regex = new RegExp(tech.version, 'i');
  } catch {
    return null;
  }
  const match = sources.match(regex);
  return match ? match[1] : null;
}

export async function detectStack({ html, headers = {} }) {
  const technologies = await fingerprints();

  const haystack = html.toLowerCase();
  const generator = metaGenerator(html).toLowerCase();
  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  const headerBlob = Object.entries(lowerHeaders)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const versionSources = `${headerBlob}\n${html}`;

  const detected = new Map();

  for (const tech of technologies) {
    if (!matches(tech, { haystack, generator, headers: lowerHeaders })) continue;
    detected.set(tech.nom, {
      nom: tech.nom,
      categorie: tech.categorie,
      confiance: tech.confiance,
      version: extractVersion(tech, versionSources),
    });
  }

  // Deductions : WooCommerce ne tourne que sur WordPress, meme si les marqueurs
  // propres a WordPress ont ete manques.
  for (const tech of technologies) {
    if (!detected.has(tech.nom) || !Array.isArray(tech.implique)) continue;
    for (const implied of tech.implique) {
      if (detected.has(implied)) continue;
      const source = technologies.find((t) => t.nom === implied);
      if (!source) continue;
      detected.set(implied, {
        nom: source.nom,
        categorie: source.categorie,
        confiance: 'certaine',
        version: null,
        deduit_de: tech.nom,
      });
    }
  }

  const all = [...detected.values()];
  const byCategory = (categorie) => all.filter((t) => t.categorie === categorie);

  const cms = byCategory('CMS')[0] ?? byCategory('Constructeur de site')[0] ?? null;
  const serveur = byCategory('Serveur')[0] ?? null;
  const php = detected.get('PHP') ?? null;

  const findings = [];
  if (php?.version && PHP_END_OF_LIFE.test(php.version)) {
    findings.push({
      id: 'php-obsolete',
      source: 'html',
      evidence: { version: php.version },
    });
  }

  return {
    findings,
    summary: {
      cms: cms ? nameWithVersion(cms) : null,
      ecommerce: byCategory('E-commerce').map(nameWithVersion),
      constructeur: byCategory('Constructeur de pages').map(nameWithVersion),
      framework: byCategory('Framework').map(nameWithVersion),
      serveur: serveur ? nameWithVersion(serveur) : null,
      php: php?.version ?? null,
      cdn: byCategory('CDN').map((t) => t.nom),
      tout: all,
      resume: resumeStack(all),
    },
  };
}

/**
 * Recalcule le resume a partir de la liste des technologies deja detectees.
 *
 * Expose parce que ce libelle est un texte, pas une mesure : il doit pouvoir
 * etre reconstruit a la generation des rapports, comme le reste de la prose,
 * sans refaire tourner la detection ni solliciter le site.
 */
export function resumeStack(tout = []) {
  const byCategory = (categorie) => tout.filter((t) => t.categorie === categorie);
  const cms = byCategory('CMS')[0] ?? byCategory('Constructeur de site')[0] ?? null;

  return summarize({
    socle: cms ?? byCategory('Framework')[0] ?? null,
    ecommerce: byCategory('E-commerce'),
    builders: byCategory('Constructeur de pages'),
    serveur: byCategory('Serveur')[0] ?? null,
  });
}

function nameWithVersion(tech) {
  return tech.version ? `${tech.nom} ${tech.version}` : tech.nom;
}

/**
 * Une ligne compacte pour la colonne stack du CSV de prospection. Le socle est
 * le CMS quand il y en a un, sinon le constructeur de site, sinon le framework
 * applicatif : un site en Next.js n'est pas un site non identifie.
 */
function summarize({ socle, ecommerce, builders, serveur }) {
  const parts = [];
  if (socle) parts.push(nameWithVersion(socle));
  if (ecommerce.length) parts.push(ecommerce[0].nom);
  if (builders.length) parts.push(builders[0].nom);
  // Ce libelle atteint le rapport client, via la ligne Technique detectee.
  const head = parts.join(' + ') || 'non identifiée';
  return serveur ? `${head} (${serveur.nom})` : head;
}
