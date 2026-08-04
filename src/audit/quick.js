/**
 * Phase 1 : tout ce qui s'obtient avec une seule requete HTTP.
 *
 * C'est ce qui rend le demarchage praticable. Un balayage de trois cents
 * entreprises passe ici en quelques minutes, on trie, puis on ne lance
 * Lighthouse que sur celles qui meritent un courrier.
 */

import { parse as parseHtml } from 'node-html-parser';
import { fetchHomepage, checkHttpRedirect, ERRORS } from '../net/http.js';
import { hostOf } from '../net/politeness.js';
import { checkHttps } from './checks/https.js';
import { checkViewport } from './checks/viewport.js';
import { checkMeta } from './checks/meta.js';
import { checkLegal } from './checks/legal.js';
import { checkTracking } from './checks/tracking.js';
import { checkImages } from './checks/images.js';
import { checkFonts } from './checks/fonts.js';
import { detectStack } from './checks/stack.js';
import { checkHeaders } from './checks/headers.js';
import { checkStructuredData } from './checks/structured.js';
import { checkSitemap } from './checks/sitemap.js';
import { checkLiens } from './checks/liens.js';
import { detecterCapacites, conclureAutomation } from './checks/automation.js';
import { choisirPages } from './pages.js';
import { chargerPage, auditerPage, regrouperParPage } from './page.js';
import { inspectCertificate, checkCertificate } from '../net/tls.js';
import { inspectDns, checkDns } from '../net/dns.js';

export const STATUS = {
  OK: 'ok',
  ROBOTS: 'bloque_robots',
  ROBOTS_UNREACHABLE: 'robots_injoignable',
  HTTP_ERROR: 'erreur_http',
  EMPTY: 'contenu_vide',
};

/**
 * En dessous de ce seuil, et sans balise structurante, le document renvoye ne
 * permet aucune analyse de contenu. Il faut alors s'abstenir plutot que
 * conclure : annoncer a un client qu'il n'a "ni titre ni viewport" alors que
 * son serveur nous a simplement renvoye une page vide detruirait la
 * credibilite de tout le rapport.
 */
const MIN_USABLE_HTML = 500;

function isUsableHtml(html) {
  const trimmed = html.trim();
  if (!trimmed) return false;
  const hasStructure = /<html[\s>]/i.test(trimmed) || /<body[\s>]/i.test(trimmed);
  return hasStructure || trimmed.length >= MIN_USABLE_HTML;
}

function failure(target, status, detail) {
  return {
    target,
    status,
    detail,
    findings: [],
    summary: {},
    page: null,
    checkedAt: new Date().toISOString(),
  };
}

export async function runQuickAudit(target, { scheduler, robots, config }) {
  const host = hostOf(target.url);
  const httpOptions = {
    userAgent: config.userAgent,
    timeout: config.timeout,
    retries: config.retries,
  };

  const verdict = await robots.check(target.url);
  if (!verdict.allowed) {
    if (verdict.networkError === ERRORS.DNS) {
      // Domaine mort : constat definitif, la cible sort de la liste.
      return failure(target, ERRORS.DNS, verdict.detail);
    }
    if (verdict.networkError) {
      // Panne passagere : on s'abstient, mais la cible merite un nouvel essai.
      return failure(target, STATUS.ROBOTS_UNREACHABLE, verdict.detail);
    }
    return failure(target, STATUS.ROBOTS, verdict.detail);
  }
  if (verdict.crawlDelay) scheduler.setHostDelay(host, verdict.crawlDelay);

  const page = await scheduler.run(host, () => fetchHomepage(target.url, httpOptions));

  if (page.error) {
    return failure(target, page.error, `${target.url} injoignable`);
  }
  if (!page.ok) {
    return failure(target, STATUS.HTTP_ERROR, `reponse ${page.status}`);
  }

  const html = page.body;

  if (!isUsableHtml(html)) {
    // Le site repond, mais ne nous donne rien a analyser. C'est un constat en
    // soi : les moteurs de recherche qui n'executent pas JavaScript voient la
    // meme chose. Lighthouse, lui, pilote un vrai navigateur et pourra
    // trancher entre page reellement vide et contenu rendu cote client.
    return {
      target,
      status: STATUS.EMPTY,
      detail: `document de ${Buffer.byteLength(html, 'utf8')} octets`,
      findings: [
        ...checkHttps({ page, redirect: { checked: false, redirectsToHttps: null } }),
        {
          id: 'page-sans-contenu-html',
          source: 'html',
          evidence: {
            octets: Buffer.byteLength(html, 'utf8'),
            statut_http: page.status,
            content_type: page.headers['content-type'] ?? null,
          },
        },
      ],
      summary: {
        html_octets: Buffer.byteLength(html, 'utf8'),
        ttfb_approx: page.approxTtfb,
        serveur: page.headers.server ?? null,
        url_finale: page.url,
        redirige: page.redirected,
      },
      page: {
        status: page.status,
        url: page.url,
        httpsAvailable: page.httpsAvailable,
        headers: page.headers,
      },
      checkedAt: new Date().toISOString(),
    };
  }

  const dom = parseHtml(html, {
    lowerCaseTagName: false,
    comment: false,
    blockTextElements: { script: true, style: true, noscript: true },
  });

  const redirect = page.httpsAvailable
    ? await scheduler.run(host, () => checkHttpRedirect(target.url, httpOptions))
    : { checked: false, redirectsToHttps: null };

  const findings = [];
  const summary = {
    html_octets: Buffer.byteLength(html, 'utf8'),
    ttfb_approx: page.approxTtfb,
    serveur: page.headers.server ?? null,
    url_finale: page.url,
    redirige: page.redirected,
  };

  findings.push(...checkHttps({ page, redirect }));

  // Constats de contenu de l'accueil. Ceux des pages secondaires viendront
  // s'y agreger plus bas, sous le meme identifiant.
  const findingsAccueil = [
    ...checkViewport({ dom }),
    ...checkMeta({ dom }),
  ];

  const images = checkImages({ dom });
  findingsAccueil.push(...images.findings);
  summary.images = images.summary;

  const fonts = checkFonts({ dom, html });
  findings.push(...fonts.findings);
  summary.fontes = fonts.summary;

  const tracking = checkTracking({ html });
  findings.push(...tracking.findings);
  summary.traceurs = tracking.summary;

  const stack = await detectStack({ html, headers: page.headers });
  findings.push(...stack.findings);
  summary.stack = stack.summary;

  const entetes = checkHeaders({
    headers: page.headers,
    httpsAvailable: page.httpsAvailable,
  });
  findings.push(...entetes.findings);
  summary.entetes = entetes.summary;

  // Certificat et DNS : deux sondes legeres, independantes du contenu, qui
  // apportent des constats datables et verifiables par le client lui-meme.
  const [certificat, dnsInfo] = await Promise.all([
    page.httpsAvailable
      ? scheduler.run(host, () =>
          inspectCertificate(new URL(page.url).hostname, { timeout: config.timeout })
        )
      : Promise.resolve({ disponible: false, raison: 'site non servi en HTTPS' }),
    inspectDns(new URL(page.url).hostname, { timeout: config.timeout }),
  ]);

  findings.push(...checkCertificate(certificat));
  findings.push(...checkDns(dnsInfo));
  summary.certificat = certificat;
  summary.dns = dnsInfo;

  const structurees = checkStructuredData({ dom, html });
  findings.push(...structurees.findings);
  summary.donnees_structurees = structurees.summary;

  const legal = await checkLegal({
    dom,
    baseUrl: page.url,
    scheduler,
    httpOptions,
  });
  findings.push(...legal.findings);
  summary.legal = legal.summary;

  const sitemap = await checkSitemap({
    baseUrl: page.url,
    declares: await robots.sitemaps(page.url),
    scheduler,
    httpOptions,
  });
  findings.push(...sitemap.findings);
  summary.sitemap = sitemap.summary;

  // -------------------------------------------------------- pages secondaires
  const choisies = config.pages > 0
    ? choisirPages({
        dom,
        baseUrl: page.url,
        sitemapUrls: sitemap.adresses,
        max: config.pages,
      })
    : [];

  const detections = [
    await detecterCapacites({ dom, html, baseUrl: page.url, stack: stack.summary }),
  ];
  const findingsSecondaires = [];
  const pagesVisitees = [];

  for (const cible of choisies) {
    const chargee = await chargerPage(cible.url, { scheduler, httpOptions });
    if (!chargee.ok) {
      pagesVisitees.push({ ...cible, ok: false, erreur: chargee.erreur ?? chargee.statut });

      // Une page du menu qui ne repond pas est un lien mort sous les yeux de
      // tous les visiteurs. L'information est deja payee, on la remonte.
      if (chargee.statut >= 400) {
        findings.push({
          id: 'page-liee-introuvable',
          source: 'html',
          evidence: {
            page: cible.libelle,
            adresse: new URL(cible.url).pathname,
            statut: chargee.statut,
          },
        });
      }
      continue;
    }

    pagesVisitees.push({ ...cible, ok: true, statut: chargee.statut });
    findingsSecondaires.push(...auditerPage({ dom: chargee.dom, page: cible }));
    detections.push(
      await detecterCapacites({
        dom: chargee.dom,
        html: chargee.html,
        baseUrl: chargee.url,
        stack: stack.summary,
      })
    );
  }

  summary.pages = {
    accueil: page.url,
    secondaires: pagesVisitees,
    examinees: 1 + pagesVisitees.filter((p) => p.ok).length,
  };

  findings.push(...regrouperParPage(findingsAccueil, findingsSecondaires));

  // Liens internes : on exclut ceux deja sollicites comme pages secondaires,
  // inutile de payer deux fois la meme requete.
  const liens = await checkLiens({
    dom,
    baseUrl: page.url,
    max: config.liens,
    deja: new Set(choisies.map((c) => c.url)),
    scheduler,
    httpOptions,
  });
  findings.push(...liens.findings);
  summary.liens = liens.summary;

  // La conclusion sur l'automatisation attend d'avoir vu toutes les pages :
  // un artisan met souvent son formulaire de devis sur sa page contact.
  const automatisation = await conclureAutomation({ detections, target });
  findings.push(...automatisation.findings);
  summary.automatisation = automatisation.summary;

  return {
    target,
    status: STATUS.OK,
    detail: null,
    findings,
    summary,
    page: {
      status: page.status,
      url: page.url,
      httpsAvailable: page.httpsAvailable,
      headers: page.headers,
    },
    checkedAt: new Date().toISOString(),
  };
}

/** Libelles francais des statuts d'echec, pour la console et le CSV. */
export const STATUS_LABELS = {
  [STATUS.OK]: 'ok',
  [STATUS.ROBOTS]: 'exclu par robots.txt',
  [STATUS.ROBOTS_UNREACHABLE]: 'robots.txt injoignable',
  [STATUS.HTTP_ERROR]: 'erreur HTTP',
  [STATUS.EMPTY]: 'page vide',
  [ERRORS.TIMEOUT]: 'delai depasse',
  [ERRORS.DNS]: 'domaine introuvable',
  [ERRORS.TLS]: 'certificat invalide',
  [ERRORS.REFUSED]: 'connexion refusee',
  [ERRORS.NETWORK]: 'erreur reseau',
};
