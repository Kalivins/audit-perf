/**
 * Balise viewport. Sans elle, un telephone rend la page comme un ecran de
 * bureau puis la reduit : le texte devient illisible. C'est le defaut mobile
 * le plus grave et le moins visible pour qui ne teste que sur ordinateur.
 */

export function checkViewport({ dom }) {
  const findings = [];
  const meta = dom.querySelector('meta[name="viewport" i]');

  if (!meta) {
    findings.push({ id: 'viewport-absent', evidence: {} });
    return findings;
  }

  const content = (meta.getAttribute('content') || '').toLowerCase();

  if (!content.includes('width=device-width')) {
    findings.push({
      id: 'viewport-mal-configure',
      evidence: { content: content || '(vide)' },
    });
  }

  // Empeche l'utilisateur de zoomer : blocage d'accessibilite reel, courant
  // sur les themes datant des annees 2010.
  if (
    /user-scalable\s*=\s*(no|0)/.test(content) ||
    /maximum-scale\s*=\s*(1(\.0+)?|0?\.\d+)\b/.test(content)
  ) {
    findings.push({
      id: 'zoom-bloque',
      evidence: { content },
    });
  }

  return findings;
}
