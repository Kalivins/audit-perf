/**
 * Choix des pages a auditer au dela de l'accueil.
 *
 * On ne parcourt pas le site : on retient un petit nombre de pages qui portent
 * la valeur commerciale, celles qu'un client visite avant de decider.
 *
 * Deux sources, et l'ordre compte. D'abord quelques roles reconnaissables au
 * vocabulaire, contact et tarifs surtout. Ensuite, et c'est l'essentiel, le
 * menu du site : chez une TPE, les pages de prestations portent le nom du
 * metier et non le mot prestations. Une boulangerie a Patisserie et Snacking,
 * un plombier a Chauffage et Sanitaire. Aucune liste de mots-cles ne les
 * trouverait, alors que le menu les designe sans ambiguite.
 *
 * Les pages legales sont ecartees : leur presence est verifiee ailleurs, et
 * auditer la redaction d'un texte reglementaire ne rend service a personne.
 */

const EXTENSIONS_IGNOREES =
  /\.(pdf|jpe?g|png|gif|webp|avif|svg|zip|docx?|xlsx?|mp4|mp3|ics)(\?|#|$)/i;

/** Roles reconnus au vocabulaire, du plus utile au moins utile. */
const ROLES = [
  {
    id: 'contact',
    libelle: 'Contact',
    motif: /(^|[\/_-])contact|nous-?joindre|nous-?ecrire|\bdevis\b|rendez-?vous/,
  },
  { id: 'tarifs', libelle: 'Tarifs', motif: /tarif|\bprix\b|forfait/ },
  {
    id: 'apropos',
    libelle: 'Présentation',
    motif: /a-?propos|qui-?sommes|notre-?(equipe|histoire)|presentation/,
  },
];

const EXCLUES =
  /mentions-?legales|infos-?legales|politique|confidentialite|\bcgv\b|\bcgu\b|cookies|plan-?du-?site|panier|\bcart\b|checkout|connexion|login|mon-?compte|wp-admin|\bfeed\b|\?add-to-cart|\bblog\b|actualites|\bnews\b/;

/** Balises et classes qui trahissent une navigation principale. */
const CONTENEURS_MENU = new Set(['nav', 'header']);
const CLASSES_MENU = /(^|[\s_-])(nav|menu|navbar|topbar|main-?menu|primary)([\s_-]|$)/i;

function deaccent(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function normaliser(href, baseUrl) {
  let url;
  try {
    url = new URL(href, baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  return url;
}

/** Remonte quelques niveaux : au dela, tout finit par etre dans un conteneur. */
function estDansLeMenu(element) {
  let noeud = element.parentNode;
  for (let niveau = 0; niveau < 6 && noeud; niveau += 1) {
    const balise = (noeud.rawTagName ?? '').toLowerCase();
    if (CONTENEURS_MENU.has(balise)) return true;
    const attributs = `${noeud.getAttribute?.('class') ?? ''} ${noeud.getAttribute?.('id') ?? ''}`;
    if (attributs.trim() && CLASSES_MENU.test(attributs)) return true;
    noeud = noeud.parentNode;
  }
  return false;
}

function roleDe(chemin, intitule) {
  const foin = `${deaccent(chemin)} ${deaccent(intitule)}`;
  return ROLES.find((role) => role.motif.test(foin)) ?? null;
}

/** Intitule lisible : le texte du lien, sinon le dernier segment du chemin. */
function libelleDepuis(intitule, url) {
  const texte = String(intitule ?? '').replace(/\s+/g, ' ').trim();
  if (texte && texte.length <= 32) return texte;
  if (texte) return `${texte.slice(0, 29)}...`;

  const segment = url.pathname.split('/').filter(Boolean).pop() ?? '';
  return segment.replace(/\.[a-z]+$/i, '').replace(/[-_]/g, ' ') || 'Page';
}

/**
 * @param {object} params
 * @param {object} params.dom page d'accueil analysee
 * @param {string} params.baseUrl adresse reellement servie
 * @param {string[]} params.sitemapUrls adresses issues du plan de site
 * @param {number} params.max nombre de pages secondaires souhaitees
 * @returns {Array<{url: string, role: string, libelle: string}>}
 */
export function choisirPages({ dom, baseUrl, sitemapUrls = [], max = 4 }) {
  const origine = new URL(baseUrl);
  const candidats = new Map();
  let ordre = 0;

  const ajouter = (href, intitule, dansLeMenu) => {
    const url = normaliser(href, baseUrl);
    if (!url) return;
    // Un audit reste sur le domaine audite : un lien sortant appartient a
    // quelqu'un d'autre et n'a pas a etre sollicite pour ce motif.
    if (url.host !== origine.host) return;
    if (EXTENSIONS_IGNOREES.test(url.pathname)) return;

    const cle = url.toString();
    if (candidats.has(cle)) return;

    const chemin = `${url.pathname}${url.search}`;
    // L'accueil sous toutes ses formes, y compris /index.php.
    if (cle === baseUrl || /^\/(index\.\w+)?$/.test(url.pathname)) return;
    if (EXCLUES.test(deaccent(chemin)) || EXCLUES.test(deaccent(intitule))) return;

    const role = roleDe(chemin, intitule);
    candidats.set(cle, {
      url: cle,
      role: role?.id ?? 'menu',
      libelle: role?.libelle ?? libelleDepuis(intitule, url),
      rang: role ? ROLES.indexOf(role) : ROLES.length,
      dansLeMenu,
      ordre: ordre++,
    });
  };

  for (const ancre of dom.querySelectorAll('a[href]')) {
    ajouter(ancre.getAttribute('href'), ancre.text, estDansLeMenu(ancre));
  }
  // Le plan de site ne sert qu'a completer : il ne dit rien de l'importance
  // d'une page, la ou le menu le dit.
  for (const url of sitemapUrls) ajouter(url, '', false);

  const tries = [...candidats.values()].sort((a, b) => {
    if (a.rang !== b.rang) return a.rang - b.rang;
    if (a.dansLeMenu !== b.dansLeMenu) return a.dansLeMenu ? -1 : 1;
    return a.ordre - b.ordre;
  });

  const retenues = [];
  const rolesVus = new Set();

  for (const page of tries) {
    if (retenues.length >= max) break;
    // Un seul exemplaire des roles nommes, plusieurs pages de menu autorisees :
    // deux pages de contact n'apprennent rien, deux prestations si.
    if (page.role !== 'menu') {
      if (rolesVus.has(page.role)) continue;
      rolesVus.add(page.role);
    }
    retenues.push(page);
  }

  return retenues;
}
