/**
 * Metadonnees de la page d'accueil : ce que Google affiche dans ses resultats
 * et ce qu'un reseau social affiche quand on partage le lien.
 */

const TITLE_MIN = 15;
const TITLE_MAX = 65;
const DESCRIPTION_MIN = 70;
const DESCRIPTION_MAX = 160;

function metaContent(dom, selector) {
  const node = dom.querySelector(selector);
  const value = node?.getAttribute('content');
  return value ? value.trim() : null;
}

export function checkMeta({ dom }) {
  const findings = [];

  const titleNode = dom.querySelector('title');
  const title = titleNode ? titleNode.text.trim() : '';

  if (!title) {
    findings.push({ id: 'titre-absent', evidence: {} });
  } else if (title.length < TITLE_MIN) {
    findings.push({
      id: 'titre-trop-court',
      evidence: { titre: title, longueur: title.length, minimum: TITLE_MIN },
    });
  } else if (title.length > TITLE_MAX) {
    findings.push({
      id: 'titre-trop-long',
      evidence: { titre: title, longueur: title.length, maximum: TITLE_MAX },
    });
  }

  const description = metaContent(dom, 'meta[name="description" i]');

  if (!description) {
    findings.push({ id: 'description-absente', evidence: {} });
  } else if (description.length < DESCRIPTION_MIN) {
    findings.push({
      id: 'description-trop-courte',
      evidence: { longueur: description.length, minimum: DESCRIPTION_MIN },
    });
  } else if (description.length > DESCRIPTION_MAX) {
    findings.push({
      id: 'description-trop-longue',
      evidence: { longueur: description.length, maximum: DESCRIPTION_MAX },
    });
  }

  const html = dom.querySelector('html');
  const lang = html?.getAttribute('lang');
  if (!lang) {
    findings.push({ id: 'langue-non-declaree', evidence: {} });
  }

  const ogTitle = metaContent(dom, 'meta[property="og:title" i]');
  const ogImage = metaContent(dom, 'meta[property="og:image" i]');
  if (!ogTitle || !ogImage) {
    findings.push({
      id: 'partage-social-non-configure',
      evidence: {
        og_title: Boolean(ogTitle),
        og_image: Boolean(ogImage),
      },
    });
  }

  const h1 = dom.querySelectorAll('h1');
  if (h1.length === 0) {
    findings.push({ id: 'titre-h1-absent', evidence: {} });
  } else if (h1.length > 1) {
    findings.push({ id: 'titres-h1-multiples', evidence: { nombre: h1.length } });
  }

  return findings;
}
