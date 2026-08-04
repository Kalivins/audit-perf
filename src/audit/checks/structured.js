/**
 * Donnees structurees, au format JSON-LD principalement.
 *
 * C'est ce qui permet a Google d'afficher correctement un commerce dans son
 * encart local : nom, adresse, horaires, telephone. Beaucoup de TPE perdent
 * la leur visibilite principale sans savoir que ce bloc existe, parce qu'il
 * est invisible sur la page.
 */

/** Types schema.org qui designent un etablissement physique. */
const TYPES_LOCAUX = new Set([
  'localbusiness', 'store', 'restaurant', 'bakery', 'cafeorcoffeeshop',
  'foodestablishment', 'barorpub', 'autorepair', 'automotivebusiness',
  'plumber', 'electrician', 'hvacbusiness', 'roofingcontractor',
  'generalcontractor', 'homeandconstructionbusiness', 'professionalservice',
  'hairsalon', 'beautysalon', 'healthandbeautybusiness', 'dentist',
  'medicalbusiness', 'physician', 'pharmacy', 'lodgingbusiness', 'hotel',
  'realestateagent', 'legalservice', 'accountingservice', 'travelagency',
  'foodtruck', 'butchershop', 'grocerystore',
]);

const TYPES_ORGANISATION = new Set(['organization', 'corporation', 'ngo']);

function typesDe(noeud) {
  const brut = noeud?.['@type'];
  if (!brut) return [];
  return (Array.isArray(brut) ? brut : [brut])
    .filter((t) => typeof t === 'string')
    .map((t) => t.toLowerCase().replace(/^https?:\/\/schema\.org\//, ''));
}

/** Aplatit @graph et les tableaux pour parcourir tous les noeuds declares. */
function aplatir(donnees, acc = []) {
  if (Array.isArray(donnees)) {
    for (const element of donnees) aplatir(element, acc);
    return acc;
  }
  if (donnees && typeof donnees === 'object') {
    acc.push(donnees);
    if (Array.isArray(donnees['@graph'])) aplatir(donnees['@graph'], acc);
  }
  return acc;
}

function lireBlocsJsonLd(dom) {
  const noeuds = [];
  let illisibles = 0;

  for (const script of dom.querySelectorAll('script')) {
    const type = (script.getAttribute('type') || '').toLowerCase();
    if (!type.includes('ld+json')) continue;

    const contenu = script.text?.trim();
    if (!contenu) continue;

    try {
      aplatir(JSON.parse(contenu), noeuds);
    } catch {
      // Un bloc mal forme est ignore par Google exactement comme par nous.
      illisibles += 1;
    }
  }

  return { noeuds, illisibles };
}

function aUneAdresse(noeud) {
  const adresse = noeud.address;
  if (!adresse) return false;
  if (typeof adresse === 'string') return adresse.trim().length > 5;
  const a = Array.isArray(adresse) ? adresse[0] : adresse;
  return Boolean(a?.streetAddress || a?.postalCode || a?.addressLocality);
}

function aDesHoraires(noeud) {
  return Boolean(
    noeud.openingHours ||
      (Array.isArray(noeud.openingHoursSpecification)
        ? noeud.openingHoursSpecification.length
        : noeud.openingHoursSpecification)
  );
}

export function checkStructuredData({ dom, html }) {
  const findings = [];
  const { noeuds, illisibles } = lireBlocsJsonLd(dom);

  const locaux = noeuds.filter((n) => typesDe(n).some((t) => TYPES_LOCAUX.has(t)));
  const organisations = noeuds.filter((n) =>
    typesDe(n).some((t) => TYPES_ORGANISATION.has(t))
  );

  // Repli sur les microdonnees, encore repandues sur les themes anciens.
  const microdonneesLocales = /itemtype\s*=\s*["']https?:\/\/schema\.org\/(LocalBusiness|Restaurant|Store|Bakery)/i.test(html);

  const summary = {
    blocs: noeuds.length,
    illisibles,
    types: [...new Set(noeuds.flatMap(typesDe))].slice(0, 12),
    fiche_locale: locaux.length > 0 || microdonneesLocales,
    organisation: organisations.length > 0,
  };

  if (!noeuds.length && !microdonneesLocales) {
    findings.push({
      id: 'donnees-structurees-absentes',
      source: 'html',
      evidence: {},
    });
    return { findings, summary };
  }

  if (!locaux.length && !microdonneesLocales) {
    findings.push({
      id: 'fiche-locale-absente',
      source: 'html',
      evidence: { types: summary.types.join(', ') || 'aucun' },
    });
    return { findings, summary };
  }

  // A partir d'ici une fiche d'etablissement existe : on regarde ce qui lui
  // manque, plutot que de repeter qu'elle est absente.
  const fiche = locaux[0];
  if (fiche) {
    const manques = [];
    if (!aUneAdresse(fiche)) manques.push('adresse postale');
    if (!fiche.telephone) manques.push('telephone');

    if (manques.length) {
      findings.push({
        id: 'coordonnees-non-declarees',
        source: 'html',
        evidence: { manques: manques.join(' et ') },
      });
    }

    if (!aDesHoraires(fiche)) {
      findings.push({ id: 'horaires-non-declares', source: 'html', evidence: {} });
    }

    summary.adresse = aUneAdresse(fiche);
    summary.telephone = Boolean(fiche.telephone);
    summary.horaires = aDesHoraires(fiche);
  }

  return { findings, summary };
}
