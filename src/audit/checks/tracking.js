/**
 * Traceurs et consentement.
 *
 * Un site qui charge Google Analytics ou le pixel Meta sans dispositif de
 * recueil du consentement s'expose a une sanction CNIL. C'est un constat a
 * forte valeur pour une TPE, et personne ne le lui a jamais dit.
 *
 * Limite assumee et rappelee dans le rapport : on n'observe que le HTML de la
 * page d'accueil. Un bandeau injecte plus tard par un script peut echapper a
 * la detection, le constat est donc formule comme un point a verifier.
 */

const TRACKERS = [
  { id: 'Google Analytics 4', pattern: /googletagmanager\.com\/gtag\/js|gtag\s*\(\s*['"]config/ },
  { id: 'Google Tag Manager', pattern: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/ },
  { id: 'Google Analytics (ancien)', pattern: /google-analytics\.com\/(analytics|ga)\.js|\bUA-\d{4,}-\d+\b/ },
  { id: 'Pixel Meta (Facebook)', pattern: /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\s*\(/ },
  { id: 'Hotjar', pattern: /static\.hotjar\.com|hjSiteSettings/ },
  { id: 'Microsoft Clarity', pattern: /clarity\.ms\/tag/ },
  { id: 'Pixel TikTok', pattern: /analytics\.tiktok\.com/ },
  { id: 'LinkedIn Insight', pattern: /snap\.licdn\.com/ },
  { id: 'Google Ads', pattern: /googleadservices\.com|googlesyndication\.com/ },
];

/** Solutions de recueil du consentement les plus repandues en France. */
const CONSENT_TOOLS = [
  { id: 'Axeptio', pattern: /axeptio/i },
  { id: 'Tarteaucitron', pattern: /tarteaucitron/i },
  { id: 'Cookiebot', pattern: /cookiebot/i },
  { id: 'Didomi', pattern: /didomi/i },
  { id: 'OneTrust', pattern: /onetrust|otSDK/i },
  { id: 'Orejime', pattern: /orejime/i },
  { id: 'Klaro', pattern: /klaro/i },
  { id: 'Complianz', pattern: /complianz|cmplz/i },
  { id: 'CookieYes', pattern: /cookieyes|cky-consent/i },
  { id: 'Iubenda', pattern: /iubenda/i },
  { id: 'Sirdata', pattern: /sddan\.com|sirdata/i },
  { id: 'Quantcast', pattern: /quantcast|__tcfapi/i },
  { id: 'Generique', pattern: /cookie[-_]?(consent|notice|banner|law-info)|tarte-au-citron|rgpd[-_]?cookie/i },
];

export function checkTracking({ html }) {
  const findings = [];

  const trackers = TRACKERS.filter((t) => t.pattern.test(html)).map((t) => t.id);
  const consent = CONSENT_TOOLS.filter((t) => t.pattern.test(html)).map((t) => t.id);

  if (trackers.length && !consent.length) {
    findings.push({
      id: 'traceurs-sans-consentement',
      evidence: { traceurs: trackers },
    });
  }

  return {
    findings,
    summary: { trackers, consent },
  };
}
