/**
 * Ce que le site sait faire tout seul, et ce qu'il ne sait pas faire.
 *
 * C'est le volet qui repond a la question du client : qu'est-ce que je peux
 * automatiser ? L'interet n'est pas l'inventaire de ce qui existe, c'est
 * l'absence, mise en regard de ce qu'on attend du metier. Un restaurant sans
 * reservation en ligne prend ses tables au telephone, pendant le service.
 *
 * Les constats emis sont des opportunites, jamais des defauts : ils sont
 * ranges dans un palier separe et n'apparaissent pas parmi les problemes.
 */

import { readFile } from 'node:fs/promises';
import { canoniser } from '../../score/secteurs.js';

const FICHIER = new URL('../../../data/automation.json', import.meta.url);

let cache = null;

async function config() {
  if (!cache) cache = JSON.parse(await readFile(FICHIER, 'utf8'));
  return cache;
}

/**
 * Libelles des capacites, reconstruits depuis les identifiants stockes.
 *
 * Comme le reste de la prose, ces intitules atteignent le rapport client et
 * doivent donc pouvoir etre corriges sans relancer une seule mesure.
 */
export async function libellerCapacites(ids = []) {
  const { capacites } = await config();
  return ids.map((id) => capacites[id] ?? id);
}

/**
 * Motifs cherches dans les liens et les boutons uniquement, jamais dans le
 * texte courant. Le mot commande apparait dans trop de phrases anodines pour
 * qu'on puisse en tirer quoi que ce soit hors d'un element cliquable.
 */
const MOTIFS = {
  // Les limites de mot sont indispensables ici, l'essai sur des sites reels
  // l'a montre : sans \b, book matche facebook et reserv matche la mention
  // tous droits reserves du pied de page. Une boulangerie ressortait alors
  // avec une reservation en ligne qu'elle n'a pas.
  reservation: /\breserver\b|\breservation|\bbooking\b|\bbook a table\b/,
  rdv: /rendez[- ]?vous|\brdv\b|prendre.{0,12}rendez|\bplanifier\b/,
  commande: /\bcommander\b|\bcommande en ligne\b|click.{0,3}(and|&).{0,3}collect|clic.{0,3}collect|boutique en ligne|\bpanier\b|\bdrive\b/,
  devis: /\bdevis\b|estimation gratuite|\bchiffrage\b/,
  contact: /\bcontact|nous ecrire|\bformulaire\b/,
};

/** Formules de pied de page qui contiennent un mot-cle sans rien signifier. */
const BRUIT = /droits?\s+reserves?|tous\s+droits/;

/**
 * Capacites pour lesquelles l'intitule ne suffit pas.
 *
 * Un bouton Reserver une table qui renvoie vers /contact n'est pas une
 * reservation en ligne, c'est un formulaire de plus. La nuance est exactement
 * ce qu'il y a a vendre : le client croit avoir automatise, et il repond
 * encore a la main. On exige donc que la destination soit soit un service
 * externe, soit une adresse qui annonce reellement le dispositif.
 */
const REQUIERT_DESTINATION = new Set(['reservation', 'rdv', 'commande']);

const DESTINATION_PARLANTE =
  /reserv|booking|\bbook\b|\brdv\b|rendez-?vous|commande|\border\b|panier|\bcart\b|boutique|\bshop\b|checkout/;

function deaccent(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Analyse des formulaires : le plus fiable des indices, car c'est du concret. */
function lireFormulaires(dom) {
  const trouve = { contact: false, devis: false, newsletter: false };

  for (const form of dom.querySelectorAll('form')) {
    const champs = form.querySelectorAll('input, textarea, select');
    const types = champs.map((c) => (c.getAttribute('type') || 'text').toLowerCase());
    const noms = deaccent(
      champs.map((c) => `${c.getAttribute('name')} ${c.getAttribute('placeholder')}`).join(' ')
    );
    const texte = deaccent(`${form.text} ${form.getAttribute('action')} ${form.getAttribute('id')} ${form.getAttribute('class')}`);

    const aEmail = types.includes('email') || /mail|courriel/.test(noms);
    const aMessage = form.querySelectorAll('textarea').length > 0;
    const estRecherche = types.includes('search') || /\bsearch|recherche/.test(texte);
    if (estRecherche) continue;

    // Une inscription a une liste de diffusion, c'est un email et presque rien
    // d'autre. Le distinguer evite de compter une newsletter comme un moyen de
    // vous joindre.
    if (aEmail && !aMessage && champs.length <= 3) {
      if (/newsletter|inscri|abonn|actualites/.test(texte)) {
        trouve.newsletter = true;
        continue;
      }
    }

    if (/devis|estimation|chiffrage/.test(texte)) trouve.devis = true;
    if (aMessage || (aEmail && champs.length >= 3)) trouve.contact = true;
  }

  return trouve;
}

/** Liens et boutons : intitule et destination, rien d'autre. */
function lireElementsCliquables(dom, baseUrl) {
  const trouve = {};
  /** Intitules prometteurs dont la destination ne tient pas la promesse. */
  const trompeurs = {};

  let hote = '';
  try {
    hote = new URL(baseUrl).host;
  } catch {
    hote = '';
  }

  const cliquables = [
    ...dom.querySelectorAll('a[href]'),
    ...dom.querySelectorAll('button'),
  ];

  for (const element of cliquables) {
    const href = element.getAttribute('href') ?? '';
    const foin = deaccent(
      `${element.text} ${href} ${element.getAttribute('title') ?? ''}`
    );
    if (!foin.trim() || BRUIT.test(foin)) continue;

    const externe = /^https?:\/\//i.test(href) && hote && !href.includes(hote);
    const destinationParlante = DESTINATION_PARLANTE.test(deaccent(href));

    for (const [capacite, motif] of Object.entries(MOTIFS)) {
      if (!motif.test(foin)) continue;

      if (REQUIERT_DESTINATION.has(capacite) && !externe && !destinationParlante) {
        trompeurs[capacite] = (element.text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        continue;
      }
      trouve[capacite] = true;
    }
  }

  // Un intitule trompeur ne compte pas si le dispositif existe par ailleurs.
  for (const capacite of Object.keys(trouve)) delete trompeurs[capacite];

  return { trouve, trompeurs };
}

/**
 * Releve les dispositifs presents sur UNE page.
 *
 * Separe de la conclusion, parce qu'un artisan met souvent son formulaire de
 * devis sur sa page contact et non sur son accueil. Conclure page par page
 * ferait annoncer au client un manque qu'il n'a pas.
 */
export async function detecterCapacites({ dom, html, baseUrl, stack = null }) {
  const { plateformes } = await config();
  const bas = html.toLowerCase();

  const capacites = new Set();
  const outils = [];

  for (const plateforme of plateformes) {
    if (!plateforme.indices.some((indice) => bas.includes(indice.toLowerCase()))) continue;
    capacites.add(plateforme.capacite);
    outils.push({ nom: plateforme.nom, capacite: plateforme.capacite });
  }

  const formulaires = lireFormulaires(dom);
  if (formulaires.contact) capacites.add('contact');
  if (formulaires.devis) capacites.add('devis');
  if (formulaires.newsletter) capacites.add('newsletter');

  // L'adresse reellement servie, pas celle saisie : une redirection vers www
  // ferait autrement passer les liens internes pour des services externes.
  const { trouve, trompeurs } = lireElementsCliquables(dom, baseUrl);
  for (const capacite of Object.keys(trouve)) capacites.add(capacite);

  // Une boutique en ligne implique la commande et le paiement, meme sans
  // qu'aucun prestataire de paiement soit visible sur la page.
  if (stack?.ecommerce?.length) {
    capacites.add('commande');
    capacites.add('paiement');
  }

  return { capacites: [...capacites], outils, trompeurs };
}

/** Conclut sur l'ensemble des pages examinees. */
export async function conclureAutomation({ detections = [], target }) {
  const { attendus, capacites: libelles } = await config();

  const enPlace = new Set();
  const outils = [];
  const trompeursBruts = {};

  for (const detection of detections) {
    for (const capacite of detection.capacites) enPlace.add(capacite);
    outils.push(...detection.outils);
    Object.assign(trompeursBruts, detection.trompeurs);
  }

  // Un intitule trompeur ne compte que si le dispositif est absent partout.
  const trompeurs = Object.fromEntries(
    Object.entries(trompeursBruts).filter(([capacite]) => !enPlace.has(capacite))
  );

  const secteur = canoniser(target?.sector, target?.name);
  const attendusSecteur = attendus[secteur] ?? attendus.autre;
  const manquants = attendusSecteur.filter((capacite) => !enPlace.has(capacite));

  const IDENTIFIANTS = {
    contact: 'contact-sans-formulaire',
    devis: 'demande-de-devis-absente',
    reservation: 'reservation-en-ligne-absente',
    rdv: 'prise-de-rdv-absente',
    commande: 'commande-en-ligne-absente',
  };

  const findings = manquants
    .filter((capacite) => IDENTIFIANTS[capacite])
    .map((capacite) => ({
      id: IDENTIFIANTS[capacite],
      source: 'html',
      evidence: { secteur },
    }));

  // L'absence de liste de diffusion n'emet plus de constat : elle se verifiait
  // sur la totalite des sites mesures, et un signal qui ne distingue jamais
  // personne n'aide ni a trier ni a conseiller. La detection reste, elle sert
  // a ne pas confondre une inscription a une lettre avec un vrai formulaire de
  // contact, et a crediter les sites qui en ont une.

  return {
    findings,
    summary: {
      secteur,
      en_place: [...enPlace].map((c) => libelles[c] ?? c),
      capacites: [...enPlace],
      manquants,
      manquants_libelles: manquants.map((c) => libelles[c] ?? c),
      // Un meme outil peut apparaitre sur plusieurs pages.
      outils: [...new Map(outils.map((o) => [o.nom, o])).values()],
      // Intitules qui promettent un dispositif sans le fournir. C'est le cas
      // le plus vendable : le gerant croit avoir automatise.
      trompeurs: Object.entries(trompeurs).map(([capacite, intitule]) => ({
        capacite,
        libelle: libelles[capacite] ?? capacite,
        intitule,
      })),
    },
  };
}
