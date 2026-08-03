/**
 * Fontes web bloquantes.
 *
 * Une fonte chargee depuis un domaine tiers sans `font-display` retarde
 * l'affichage du texte : le visiteur voit une page blanche alors que le
 * contenu est deja arrive. Tres frequent sur les themes WordPress installes
 * sans reglage.
 */

const FONT_HOSTS =
  /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.bunny\.net|cdn\.jsdelivr\.net\/npm\/@fontsource/i;

export function checkFonts({ dom, html }) {
  const findings = [];
  const remote = [];
  let blockingRemote = 0;

  for (const link of dom.querySelectorAll('link[href]')) {
    const href = link.getAttribute('href') || '';
    if (!FONT_HOSTS.test(href)) continue;

    const rel = (link.getAttribute('rel') || '').toLowerCase();
    remote.push(href);

    // preconnect et preload ne bloquent pas le rendu, seule la feuille de
    // style le fait.
    if (rel.includes('stylesheet') && !/display=(swap|optional|fallback)/i.test(href)) {
      blockingRemote += 1;
    }
  }

  if (blockingRemote > 0) {
    findings.push({
      id: 'fontes-bloquantes',
      source: 'html',
      evidence: { feuilles: blockingRemote, hotes: remote.slice(0, 3) },
    });
  }

  // @font-face declares en ligne sans font-display.
  const faces = html.match(/@font-face\s*\{[^}]*\}/gi) || [];
  const facesWithoutDisplay = faces.filter((face) => !/font-display/i.test(face));
  if (facesWithoutDisplay.length >= 2) {
    findings.push({
      id: 'fontes-locales-sans-affichage',
      source: 'html',
      evidence: { declarations: facesWithoutDisplay.length, total: faces.length },
    });
  }

  return {
    findings,
    summary: {
      fontes_distantes: remote.length,
      feuilles_bloquantes: blockingRemote,
      font_face: faces.length,
    },
  };
}
