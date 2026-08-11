/**
 * Rapport HTML autonome, destine au client.
 *
 * Principe directeur : le chiffre ne vaut que par la phrase qui l'explique.
 * Chaque probleme est presente dans l'ordre ce qu'on a mesure, ce que ca
 * coute, ce qu'il faut faire. Un gerant de PME doit pouvoir lire ce document
 * en entier sans rencontrer un seul terme technique non explique.
 *
 * Les commentaires de ce fichier sont sans accent, comme partout dans le code.
 * Les chaines destinees au client, elles, sont accentuees : c'est un document
 * facture, la moindre coquille abime la confiance dans les chiffres.
 */

import { page, jauge, etiquette, section, para, classeSeuil } from './template.js';
import {
  escapeHtml, seconds, ms, bytes, decimal, integer, duree,
  score as toScore, frenchDate,
} from '../util/format.js';
import { TIERS, TIER_LABELS, TIER_ORDER } from '../score/rules.js';
import { CWV_THRESHOLDS } from '../config.js';
import { STATUS } from '../audit/quick.js';

const NOMS_JAUGES = {
  performance: 'Performance',
  accessibilite: 'Accessibilité',
  bonnes_pratiques: 'Bonnes pratiques',
  seo: 'Référencement',
};

function entete(record) {
  const t = record.target;
  return `<header class="entete">
  <div class="surtitre">Audit de performance et de conformité</div>
  <h1>${escapeHtml(t.name)}</h1>
  <div class="url">${escapeHtml(t.url)}</div>
  <div class="date">Analyse du ${escapeHtml(frenchDate(record.checkedAt))}</div>
</header>`;
}

/**
 * Le chiffre d'ouverture. Le temps d'affichage mobile est le plus parlant :
 * c'est litteralement ce que vit le client dans la rue, sur son forfait.
 */
function verdict(record, lh) {
  const lcp = lh?.metrics?.lcp;
  const bloquants = record.consolidated?.parPalier?.[TIERS.BLOQUANT] ?? 0;

  const mentionBloquants =
    bloquants > 0
      ? `<p class="legende"><strong>${bloquants}</strong> point${bloquants > 1 ? 's' : ''} bloquant${bloquants > 1 ? 's' : ''} ${bloquants > 1 ? 'demandent' : 'demande'} par ailleurs une correction rapide, pour des raisons juridiques ou de sécurité.</p>`
      : '';

  if (Number.isFinite(lcp)) {
    const classe = classeSeuil(lcp, {
      bon: CWV_THRESHOLDS.lcp.good,
      moyen: CWV_THRESHOLDS.lcp.poor,
    });
    const conforme = lcp <= CWV_THRESHOLDS.lcp.good;
    const suite = conforme
      ? 'Vous êtes sous le seuil de 2,5 secondes considéré comme correct par Google.'
      : 'Le seuil considéré comme correct par Google est de 2,5 secondes.';

    return `<div class="verdict">
  <div class="chiffre ${classe}">${escapeHtml(seconds(lcp))}</div>
  <p class="legende">C'est le temps qu'attend un visiteur avant de voir l'essentiel de votre page, depuis un téléphone sur le réseau mobile. ${suite}</p>
  ${mentionBloquants}
</div>`;
  }

  return `<div class="verdict">
  <div class="chiffre ${bloquants ? 'rouge' : 'vert'}">${bloquants}</div>
  <p class="legende">point${bloquants > 1 ? 's' : ''} bloquant${bloquants > 1 ? 's' : ''} relevé${bloquants > 1 ? 's' : ''} sur votre site, de nature juridique ou technique.</p>
</div>`;
}

function jauges(lh) {
  if (!lh?.scores) return '';
  const contenu = Object.entries(NOMS_JAUGES)
    .map(([cle, nom]) => jauge(toScore(lh.scores[cle]), nom))
    .join('\n');
  const profil = lh.strategy === 'desktop' ? 'ordinateur' : 'téléphone mobile';

  return `<div class="jauges">${contenu}</div>
<p style="color:var(--encre-douce);font-size:0.9rem">
Notes établies par Lighthouse, l'outil de mesure publié par Google, sur le
profil ${escapeHtml(profil)}.</p>${malentenduSeo(lh)}`;
}

/**
 * Le paragraphe qui empeche la conclusion la plus frequente, et la plus fausse.
 *
 * Devant une note de referencement a 100 posee a cote d'une performance a 40,
 * un gerant conclut que le classement est acquis et que la vitesse peut
 * attendre. Le mot « SEO » porte cette confusion : la categorie de Lighthouse
 * est une liste de controle d'indexabilite, et Google la documente ainsi.
 *
 * Le paragraphe ne s'affiche que dans ce cas de figure. Sur un site dont les
 * deux notes se tiennent, il n'expliquerait rien et diluerait le reste.
 */
function malentenduSeo(lh) {
  const seo = toScore(lh?.scores?.seo);
  const perf = toScore(lh?.scores?.performance);
  if (!Number.isFinite(seo) || !Number.isFinite(perf)) return '';
  if (seo < 90 || perf >= 70) return '';

  return `
<div class="note-seo">
<p><strong>Une précision sur la note de référencement, qui prête à confusion.</strong>
Elle mesure l'indexabilité et non le classement. Lighthouse y vérifie la
présence d'un titre, d'une description et de balises lisibles par un moteur.
Votre note de ${seo} signifie donc que rien n'empêche Google de lire ce site.</p>
<p>Le classement dépend d'autres facteurs, et la vitesse d'affichage en fait
partie depuis 2021. Son effet le plus mesurable se situe pourtant ailleurs :
un visiteur qui referme la page avant qu'elle s'affiche n'apparaît dans aucune
de ces quatre notes.</p>
</div>`;
}

/** Comparatif mobile / bureau : l'ecart est souvent l'argument le plus net. */
function comparatif(record) {
  const mobile = record.lighthouse?.mobile;
  const bureau = record.lighthouse?.desktop;
  if (!mobile?.metrics && !bureau?.metrics) return '';

  const lignes = [
    ['Note de performance', (r) => toScore(r?.scores?.performance) ?? '-'],
    ['Affichage du contenu principal', (r) => (r?.metrics?.lcp ? seconds(r.metrics.lcp) : '-')],
    ['Stabilité visuelle', (r) => (Number.isFinite(r?.metrics?.cls) ? decimal(r.metrics.cls) : '-')],
    ['Blocage pendant le chargement', (r) => (Number.isFinite(r?.metrics?.tbt) ? ms(r.metrics.tbt) : '-')],
    ['Réponse du serveur', (r) => (Number.isFinite(r?.metrics?.ttfb) ? ms(r.metrics.ttfb) : '-')],
    ['Poids de la page', (r) => (r?.resources?.poids_total ? bytes(r.resources.poids_total) : '-')],
    ['Nombre de fichiers chargés', (r) => (r?.resources?.requetes ? integer(r.resources.requetes) : '-')],
  ];

  const corps = lignes
    .map(
      ([nom, lire]) => `<tr>
      <td>${escapeHtml(nom)}</td>
      <td class="nombre">${escapeHtml(String(lire(mobile)))}</td>
      <td class="nombre">${escapeHtml(String(lire(bureau)))}</td>
    </tr>`
    )
    .join('\n');

  return `<table class="comparatif">
  <thead><tr><th>Mesure</th><th style="text-align:right">Téléphone</th>
  <th style="text-align:right">Ordinateur</th></tr></thead>
  <tbody>${corps}</tbody>
</table>
<p style="color:var(--encre-douce);font-size:0.9rem">
La colonne téléphone est celle qui compte : c'est par là qu'arrive la majorité
des visiteurs d'un commerce local, et c'est aussi la version que Google utilise
pour classer votre site.</p>`;
}

function probleme(finding, rang) {
  const gains = [];
  if (Number.isFinite(finding.savingsMs) && finding.savingsMs > 0) {
    gains.push(`${ms(finding.savingsMs)} gagnées`);
  }
  if (Number.isFinite(finding.savingsBytes) && finding.savingsBytes > 0) {
    gains.push(`${bytes(finding.savingsBytes)} en moins`);
  }

  const constat = finding.texte.constat
    ? `<div class="bloc constat"><div class="intitule">Ce que nous avons mesuré</div>
       ${para(finding.texte.constat)}</div>`
    : '';

  return `<article class="probleme">
  <div class="tete">
    <span class="rang">${rang}</span>
    <h3>${escapeHtml(finding.texte.titre)}</h3>
    ${etiquette(TIER_LABELS[finding.tier], finding.tier)}
    ${gains.length ? etiquette(gains.join(', '), 'gain') : ''}
    ${etiquette(`correction ${finding.effortLabel}`, 'corriger')}
  </div>
  ${constat}
  <div class="bloc cout"><div class="intitule">Ce que cela vous coûte</div>
    ${para(finding.texte.cout)}</div>
  <div class="bloc"><div class="intitule">Ce qu'il faut faire</div>
    ${para(finding.texte.correction)}</div>
  ${finding.texte.reserve ? `<div class="reserve">${escapeHtml(finding.texte.reserve)}</div>` : ''}
</article>`;
}

function estimationGains(gains) {
  if (!gains?.mesurable) return '';
  const items = [];

  if (gains.temps && !gains.temps.conforme) {
    items.push([
      'Temps à rattraper pour atteindre le seuil recommandé',
      seconds(gains.temps.ecart_ms),
    ]);
  }
  if (gains.poids) {
    items.push(['Poids actuel de la page', bytes(gains.poids.actuel_octets)]);
    items.push([
      'Poids évitable identifié',
      `${bytes(gains.poids.evitable_octets)} (${Math.round(gains.poids.part_evitable * 100)} %)`,
    ]);
    items.push([
      'Attente en moins sur le réseau mobile',
      duree(gains.poids.secondes_4g_economisees),
    ]);
  }
  if (!items.length) return '';

  const liste = items
    .map(
      ([nom, valeur]) =>
        `<li><span>${escapeHtml(nom)}</span><span class="valeur">${escapeHtml(valeur)}</span></li>`
    )
    .join('\n');

  const audience = gains.audience
    ? `<div class="reserve"><strong>Sur votre trafic déclaré de
       ${integer(gains.audience.trafic_mensuel)} visites par mois</strong>, la probabilité
       qu'un visiteur reparte sans rien faire augmente d'environ
       ${gains.audience.hausse_rebond_pct} % par rapport à ${escapeHtml(gains.audience.reference)}.
       ${escapeHtml(gains.audience.reserve)} Source : ${escapeHtml(gains.audience.source)}.</div>`
    : `<div class="reserve">L'effet sur votre chiffre d'affaires n'est pas chiffré ici :
       il demande vos volumes de visites et votre taux de transformation réels.
       C'est le premier point à regarder ensemble.</div>`;

  const methodeGain = gains.poids?.methode
    ? `<p style="color:var(--encre-douce);font-size:0.85rem">${escapeHtml(gains.poids.methode)}</p>`
    : '';

  return `<ul class="gain-liste">${liste}</ul>\n${methodeGain}\n${audience}`;
}

function autresProblemes(findings) {
  if (!findings.length) return '';

  return TIER_ORDER.map((tier) => {
    const liste = findings.filter((f) => f.tier === tier);
    if (!liste.length) return '';
    const items = liste
      .map(
        (f) => `<li>
        <span class="titre">${escapeHtml(f.texte.titre)}</span>
        ${etiquette(`correction ${f.effortLabel}`, 'corriger')}
        ${f.texte.constat ? `<span class="detail">${escapeHtml(f.texte.constat)}</span>` : ''}
      </li>`
      )
      .join('\n');
    return `<details>
  <summary>${escapeHtml(TIER_LABELS[tier])} : ${liste.length} point${liste.length > 1 ? 's' : ''}</summary>
  <div class="contenu"><ul class="reste">${items}</ul></div>
</details>`;
  }).join('\n');
}

function annexe(record, lh) {
  const stack = record.quick?.summary?.stack;
  const traceurs = record.quick?.summary?.traceurs;
  const lignes = [];

  if (stack?.resume) lignes.push(['Technique détectée', stack.resume]);
  if (stack?.php) lignes.push(['Version de PHP', stack.php]);
  if (traceurs?.trackers?.length) lignes.push(['Traceurs', traceurs.trackers.join(', ')]);
  if (traceurs?.consent?.length) lignes.push(['Recueil du consentement', traceurs.consent.join(', ')]);
  if (record.quick?.summary?.serveur) lignes.push(['Serveur', record.quick.summary.serveur]);
  if (lh?.lighthouseVersion) lignes.push(['Version de Lighthouse', lh.lighthouseVersion]);

  if (!lignes.length) return '';

  const corps = lignes
    .map(
      ([nom, valeur]) =>
        `<tr><td>${escapeHtml(nom)}</td><td class="nombre">${escapeHtml(String(valeur))}</td></tr>`
    )
    .join('\n');

  return `<details>
  <summary>Détails techniques</summary>
  <div class="contenu"><table class="comparatif"><tbody>${corps}</tbody></table></div>
</details>`;
}

function methode(record, gains) {
  const sources = gains?.sources?.length
    ? `<p>Sources des chiffres avancés :</p><ul>${gains.sources
        .map((s) => `<li>${escapeHtml(s)}</li>`)
        .join('')}</ul>`
    : '';

  return `<div class="note">
  <p><strong>Comment cet audit a été réalisé.</strong> Les mesures proviennent de
  Lighthouse, l'outil publié par Google, exécuté sur un navigateur Chrome piloté
  depuis notre poste. Le profil téléphone simule une connexion mobile et un
  appareil courant, ce qui correspond à la situation réelle de la plupart de vos
  visiteurs. Les conformités juridiques sont vérifiées sur votre page d'accueil.</p>
  <p>La réactivité au clic est approchée par une mesure de laboratoire. La
  métrique de terrain équivalente demande des données issues de vos visiteurs
  réels, dont nous ne disposons pas ici.</p>
  <p>Les temps de chargement varient d'une mesure à l'autre selon la charge du
  serveur et du réseau. Les écarts importants sont significatifs, quelques
  dixièmes de seconde ne le sont pas.</p>
  ${sources}
  ${mentionRepli(record)}
  ${pagesExaminees(record)}
  <p>Analyse du ${escapeHtml(frenchDate(record.checkedAt))} sur
  <code>${escapeHtml(record.quick?.page?.url ?? record.target.url)}</code>.</p>
</div>`;
}

/**
 * Mention du repli de user-agent.
 *
 * C'est la contrepartie du procede : s'il n'est pas ecrit dans le rapport, il
 * n'a pas a exister. Et l'information interesse le client, qui ignore souvent
 * que son hebergeur ecarte les outils d'analyse.
 */
function mentionRepli(record) {
  if (!record.quick?.summary?.ua_repli) return '';

  return `<p>Votre hébergeur a d'abord écarté notre outil d'analyse, qui
  s'identifie comme tel. Nous avons donc relevé les mesures en nous présentant
  comme un navigateur ordinaire, exactement comme le fait un de vos visiteurs.
  Ce filtrage est un réglage courant de l'hébergement : il n'a probablement
  jamais été décidé par vous, mais il écarte de la même façon certains outils
  de référencement et de surveillance.</p>`;
}

/**
 * Le perimetre exact de l'audit. Le client doit savoir ce qui a ete regarde,
 * et donc ce qui ne l'a pas ete : un constat annonce sur quatre pages ne dit
 * rien des quarante autres.
 */
function pagesExaminees(record) {
  const pages = record.quick?.summary?.pages;
  if (!pages) return '';

  const visitees = (pages.secondaires ?? []).filter((p) => p.ok);
  if (!visitees.length) {
    return `<p>Cet audit porte sur votre page d'accueil. Nous n'avons pas trouvé
    d'autre page à examiner depuis celle-ci.</p>`;
  }

  const total = record.quick?.summary?.sitemap?.pages;
  const precision =
    Number.isFinite(total) && total > visitees.length + 1
      ? ` Votre site en compte ${integer(total)} au total : les constats
        présentés ici valent pour les pages examinées, et il est probable que
        les mêmes se retrouvent ailleurs.`
      : '';

  return `<p>Cet audit porte sur ${visitees.length + 1} pages : votre accueil,
  ainsi que ${escapeHtml(visitees.map((p) => p.libelle).join(', '))}.${precision}</p>`;
}

/**
 * Ce que le site sait deja faire, et ce qu'il pourrait faire.
 *
 * Presente a part des problemes, et formule comme une proposition et non
 * comme un reproche : ne pas prendre ses reservations en ligne n'est pas une
 * faute, c'est un choix qui a un cout.
 */
function automatisation(record) {
  const auto = record.quick?.summary?.automatisation;
  const opportunites = record.consolidated?.opportunites ?? [];
  if (!auto && !opportunites.length) return '';

  const enPlace = auto?.en_place ?? [];
  const outils = auto?.outils ?? [];

  const dejaLa = enPlace.length
    ? `<p><strong>Ce que votre site sait déjà faire :</strong>
       ${escapeHtml(enPlace.join(', '))}${
         outils.length
           ? ` (via ${escapeHtml([...new Set(outils.map((o) => o.nom))].join(', '))})`
           : ''
       }.</p>`
    : `<p>Nous n'avons repéré aucun dispositif automatisé sur votre page d'accueil.
       Tout ce qui vous arrive passe donc par le téléphone ou le déplacement.</p>`;

  // Le cas le plus parlant : un bouton qui promet, une destination qui ne
  // tient pas. Le gerant est persuade d'avoir mis en place le dispositif.
  const trompeurs = (auto?.trompeurs ?? [])
    .map(
      (t) => `<div class="reserve">Votre page comporte un bouton
      « ${escapeHtml(t.intitule)} », mais il renvoie vers une page ordinaire de
      votre site, pas vers un outil de ${escapeHtml(t.libelle.toLowerCase())}.
      Le visiteur qui clique croit réserver et se retrouve devant un formulaire
      auquel vous devrez répondre à la main.</div>`
    )
    .join('\n');

  const propositions = opportunites
    .map(
      (f) => `<article class="probleme">
  <div class="tete">
    <h3>${escapeHtml(f.texte.titre)}</h3>
    ${etiquette(`mise en place ${f.effortLabel}`, 'corriger')}
  </div>
  ${f.texte.constat ? `<div class="bloc constat">${para(f.texte.constat)}</div>` : ''}
  <div class="bloc cout"><div class="intitule">Ce que cela vous coûte aujourd'hui</div>
    ${para(f.texte.cout)}</div>
  <div class="bloc"><div class="intitule">Ce que nous proposons</div>
    ${para(f.texte.correction)}</div>
</article>`
    )
    .join('\n');

  if (!propositions) {
    return `${dejaLa}${trompeurs}<p>Sur les usages courants de votre métier, votre
    site est déjà bien équipé.</p>`;
  }

  return `${dejaLa}\n${trompeurs}\n${propositions}`;
}

/**
 * Position dans le metier, calculee sur les seuls sites du lot.
 *
 * La reserve est ecrite noir sur blanc : laisser croire a un classement
 * sectoriel complet serait un mensonge par omission, et le client le
 * decouvrirait tot ou tard.
 */
function comparaisonConfreres(record) {
  const c = record.comparaison;
  if (!c) return '';

  const position =
    c.rang === 1
      ? 'la plus rapide du groupe'
      : c.rang === c.total
        ? 'la plus lente du groupe'
        : `en ${c.rang}<sup>e</sup> position sur ${c.total}`;

  const ecart = c.lcp - c.mediane;
  const versusMediane =
    Math.abs(ecart) < 300
      ? 'Vous êtes dans la moyenne du groupe.'
      : ecart > 0
        ? `Votre page met ${escapeHtml(seconds(ecart))} de plus que la médiane du groupe.`
        : `Votre page met ${escapeHtml(seconds(-ecart))} de moins que la médiane du groupe.`;

  return `<p>Nous avons mesuré <strong>${c.total} entreprises</strong> du même métier
  (${escapeHtml(c.libelle.toLowerCase())}) dans le secteur de Besançon. Sur le temps
  d'affichage mobile, votre page est ${position}.</p>
  <ul class="gain-liste">
    <li><span>Votre page</span><span class="valeur">${escapeHtml(seconds(c.lcp))}</span></li>
    <li><span>Médiane du groupe</span><span class="valeur">${escapeHtml(seconds(c.mediane))}</span></li>
    <li><span>La plus rapide du groupe</span><span class="valeur">${escapeHtml(seconds(c.meilleur))}</span></li>
  </ul>
  <p>${versusMediane}</p>
  <div class="reserve">Cette comparaison porte sur les entreprises que nous avons
  mesurées, et non sur l'ensemble du secteur. Elle donne un ordre de grandeur
  de ce que font vos confrères, pas un classement officiel.</div>`;
}

/**
 * Donnees de terrain. Affichees uniquement quand CrUX a effectivement repondu,
 * ce qui est rare sur une TPE locale. C'est la seule source d'un INP reel : le
 * reste du rapport s'appuie sur une approximation de laboratoire, et le dire
 * ici donne au client la mesure de la difference.
 */
function donneesTerrain(record) {
  const terrain = record.terrain;
  if (!terrain?.disponible || !terrain.metriques) return '';

  const lignes = [
    ['Affichage du contenu principal', terrain.metriques.lcp, (v) => seconds(v), CWV_THRESHOLDS.lcp],
    ['Réactivité au clic', terrain.metriques.inp, (v) => ms(v), CWV_THRESHOLDS.inp],
    ['Stabilité visuelle', terrain.metriques.cls, (v) => decimal(v), CWV_THRESHOLDS.cls],
    ['Réponse du serveur', terrain.metriques.ttfb, (v) => ms(v), CWV_THRESHOLDS.ttfb],
  ].filter(([, valeur]) => Number.isFinite(valeur));

  if (!lignes.length) return '';

  const corps = lignes
    .map(([nom, valeur, formater, seuils]) => {
      const etat =
        valeur <= seuils.good ? 'correct' : valeur <= seuils.poor ? 'à améliorer' : 'insuffisant';
      return `<tr><td>${escapeHtml(nom)}</td>
        <td class="nombre">${escapeHtml(formater(valeur))}</td>
        <td class="nombre">${escapeHtml(etat)}</td></tr>`;
    })
    .join('\n');

  return `<table class="comparatif">
  <thead><tr><th>Mesure</th><th style="text-align:right">Vos visiteurs</th>
  <th style="text-align:right">Appréciation</th></tr></thead>
  <tbody>${corps}</tbody>
</table>
<p style="color:var(--encre-douce);font-size:0.9rem">
Ces chiffres ne viennent pas d'une simulation : ils sont relevés sur vos
visiteurs réels utilisant Chrome, avec leurs propres appareils et leur propre
connexion, et publiés par Google. La réactivité au clic mesurée ici est la
véritable mesure, celle que le reste de ce rapport ne peut qu'approcher.</p>`;
}

/** Site injoignable : un rapport court et honnete, sans chiffres inventes. */
function rapportIndisponible(record, libelle) {
  return page({
    titre: `Audit ${record.target.name}`,
    corps: `${entete(record)}
<div class="verdict">
  <div class="chiffre rouge">Site injoignable</div>
  <p class="legende">Nous n'avons pas pu analyser ce site : ${escapeHtml(libelle)}.
  ${escapeHtml(record.detail ?? '')}</p>
</div>
<p>Tant que le site ne répond pas à une requête standard, aucune mesure ne peut
être produite. C'est en soi un constat : ce que nous voyons est ce que voient
également les moteurs de recherche et une partie de vos visiteurs.</p>
${methode(record, null)}`,
  });
}

/**
 * @param {object} record enregistrement complet d'une cible
 * @param {{statusLabel?: string}} options
 * @returns {string} document HTML complet
 */
export function buildReport(record, options = {}) {
  const mesurable = record.status === STATUS.OK || record.status === STATUS.EMPTY;
  if (!mesurable) {
    return rapportIndisponible(record, options.statusLabel ?? record.status);
  }

  const lh = record.lighthouse?.[record.profilRetenu] ?? null;
  const top = record.consolidated?.top ?? [];
  // Le reste ne porte que sur les defauts : les opportunites ont leur section.
  const defauts = record.consolidated?.defauts ?? record.consolidated?.findings ?? [];
  const reste = defauts.slice(top.length);

  const corps = [
    entete(record),
    verdict(record, lh),
    jauges(lh),
    section('Les cinq points les plus coûteux', top.map((f, i) => probleme(f, i + 1)).join('\n')),
    section('Ce que vous pouvez gagner', estimationGains(record.gains)),
    section('Ce que vous pourriez automatiser', automatisation(record)),
    section('Face à vos confrères', comparaisonConfreres(record)),
    section('Mesures relevées sur vos visiteurs réels', donneesTerrain(record)),
    section('Téléphone et ordinateur', comparatif(record)),
    section('Le reste des points relevés', autresProblemes(reste)),
    annexe(record, lh),
    methode(record, record.gains),
  ]
    .filter(Boolean)
    .join('\n\n');

  return page({ titre: `Audit ${record.target.name}`, corps });
}
