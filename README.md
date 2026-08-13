# audit-perf

Audit de performance et de conformité pour sites de TPE et PME françaises.
100 % local, aucun service tiers, aucune clé API.

L'outil prend une liste d'entreprises et produit deux choses :

1. **une liste de prospection** triée du pire au meilleur, en console et en CSV ;
2. **un rapport HTML par site**, autonome et présentable à un client, qui
   traduit chaque problème technique en conséquence commerciale
   compréhensible par un gérant.

Le parti pris tient en une phrase : un score Lighthouse ne vaut rien sans la
phrase qui explique ce qu'il coûte. Les textes clients vivent dans
`data/copy/*.json`, hors du code, pour être réécrits dans votre propre voix.

## Installation

```bash
git clone https://github.com/Kalivins/audit-perf.git
cd audit-perf
npm install
```

Prérequis : **Node.js 20+** et **Google Chrome** installé (Lighthouse le
pilote en arrière-plan). Le mode `--quick` fonctionne sans Chrome.

## Usage

### Le fichier de cibles

Une ligne par entreprise, seule l'URL est obligatoire :

```csv
nom_entreprise,url,secteur,email,trafic_mensuel
Boulangerie RB,https://boulangerie-rb.fr/,Boulangerie,contact@exemple.fr,1200
Garage Marcand,www.garagemarcand.fr,Automobile,,
```

Le séparateur peut être une virgule, un point-virgule (export Excel en locale
française) ou une tabulation : il est détecté automatiquement, tout comme le
BOM UTF-8 et l'absence d'en-tête. Les colonnes peuvent être dans le désordre,
les lignes vides et les commentaires `#` sont ignorés.

Vérifiez la lecture avant de lancer des heures d'analyse :

```bash
node bin/audit.js check ma-liste.csv
```

### Les deux temps

Le balayage rapide ne fait **qu'une requête par site** et traite quelques
centaines d'entreprises en quelques minutes. Il sert à repérer qui vaut la
peine. L'analyse complète lance Lighthouse et prend **une à deux minutes par
site** : on la réserve aux cibles retenues.

```bash
node bin/audit.js scan prospects.csv --quick     # balayage large
node bin/audit.js scan retenus.csv               # analyse complète
```

Sans ce découpage, 300 sites en analyse complète représenteraient une dizaine
d'heures de mesures.

### Les autres commandes

```bash
node bin/audit.js serve               # consulte les rapports dans un navigateur
node bin/audit.js list                # réaffiche la synthèse depuis le cache
node bin/audit.js report              # régénère rapports et CSV sans rescanner
node bin/audit.js --help
```

`serve` ouvre `http://127.0.0.1:4173/` sur un sommaire qui liste tous les sites
triés, avec la phrase d'accroche de chacun, et un lien vers son rapport. Le
serveur n'écoute que sur cette machine : les rapports contiennent des données
d'entreprises réelles et ne doivent pas se retrouver exposés sur le réseau
local par inadvertance.

`report` est utile dès que vous retouchez une formulation : les fichiers sont
refaits en une seconde, et les sites audités ne sont pas sollicités à nouveau.

### Options principales

| Option | Défaut | Rôle |
|---|---|---|
| `--quick` | | phase HTTP seule, sans Lighthouse |
| `--concurrency <n>` | `8` | sites en parallèle sur la phase HTTP |
| `--lh-concurrency <n>` | `2` | mesures Lighthouse en parallèle |
| `--delay <ms>` | `2000` | délai minimal entre deux requêtes vers un même domaine |
| `--strategies <liste>` | `mobile,desktop` | profils mesurés |
| `--max-age <jours>` | | réanalyser au delà de cet âge |
| `--force` | | ignorer le cache |
| `--limit <n>` | | ne traiter que les n premières cibles |
| `--out <dossier>` | `./out` | dossier de sortie |
| `--crux` | | ajouter les données de terrain Google (voir plus bas) |

## Ce que l'outil vérifie

81 constats répartis en quatre paliers : bloquant, coûteux, à corriger, et
opportunité.

**Périmètre** : la page d'accueil plus quatre pages secondaires choisies dans
le menu du site (`--pages`). Lighthouse ne tourne que sur l'accueil, une mesure
de performance coûtant une trentaine de secondes. Les défauts de contenu, eux,
sont relevés sur toutes les pages examinées et regroupés en un seul constat
listant les pages concernées.

**Performance** : scores Lighthouse (performance, accessibilité, bonnes
pratiques, référencement) en mobile et en bureau, LCP, CLS, TBT, TTFB, poids
total et nombre de requêtes.

**Conformité française** : présence et validité des mentions légales
(article 1-1 de la LCEN) et de la politique de confidentialité, traceurs
déposés sans dispositif de consentement, HTTPS présent et imposé, version de
PHP encore supportée.

**Sécurité et infrastructure** : date d'expiration et validité du certificat
TLS, version du protocole, en-têtes de sécurité, et surtout SPF et DMARC.
Sans DMARC, n'importe qui peut envoyer un courrier en se faisant passer pour
l'entreprise, à ses clients comme à ses fournisseurs.

**Cookies réellement déposés** : un navigateur neuf ouvre la page, ne clique
sur rien, et l'outil relève ce qui s'est écrit dans son pot à cookies. Le
constat passe de l'indice à la preuve, en nommant les cookies et leurs
services. C'est décisif : un site du lot affiche un bandeau de consentement et
dépose quand même Google Analytics et Google Ads avant tout clic, ce que
l'analyse du HTML seul ne pouvait pas voir. Nécessite Chrome, donc absent du
mode rapide.

**Liens morts** : sondage borné des liens internes de la page d'accueil
(`--liens`, 10 par défaut, coupé en mode rapide). Vérifier deux cents liens
sur trois cents sites reviendrait à marteler des serveurs mutualisés pendant
des heures pour un gain marginal.

**Référencement local** : données structurées LocalBusiness, adresse,
téléphone et horaires déclarés, plan de site et taille réelle du site.
Pour un commerce de quartier, l'encart local de Google est souvent la
première source de visites.

**Automatisation** : ce que le site sait faire et surtout ce qu'il ne sait pas
faire, comparé aux usages du métier. Réservation, prise de rendez-vous,
commande, demande de devis, formulaire de contact, liste de diffusion, avec
reconnaissance des plateformes courantes. L'outil repère aussi les intitulés
trompeurs, ces boutons « Réserver une table » qui renvoient vers un formulaire
de contact : le gérant croit avoir automatisé et répond encore à la main.

**Comparaison entre confrères** : rang de l'entreprise sur le temps
d'affichage, parmi les sites du même métier présents dans le lot. À partir de
trois entreprises, et le rapport précise que la comparaison ne porte pas sur
le secteur entier.

**Mobile et accessibilité** : balise viewport, blocage du zoom, contraste,
descriptions d'images, étiquettes de formulaire.

**Contenu** : titre, description, h1, langue déclarée, aperçu de partage,
et surtout l'indexation bloquée, ce réglage de mise au point resté actif
après une refonte qui rend un site entier invisible sur Google.

**Technique** : détection de 37 CMS, constructeurs de site, frameworks et
serveurs, extensible via `data/fingerprints.json`.

Les opportunités d'automatisation sont tenues à l'écart des défauts. Ne pas
prendre ses réservations en ligne n'est pas une faute, c'est un choix qui a un
coût : le rapport les présente dans leur propre section, comme des
propositions.

### Étendre les secteurs

Les attentes d'automatisation dépendent du métier. Pour en ajouter un :
compléter `data/automation.json` (plateformes et capacités attendues) et
`src/score/secteurs.js` (mots-clés de reconnaissance). Les quatre secteurs
livrés sont la restauration, le commerce alimentaire, l'artisanat du bâtiment
et l'automobile, plus la beauté, la santé, le commerce et les services.

## Deux principes de conception

### La concurrence n'est pas la même sur les deux phases

Huit requêtes HTTP en parallèle ne posent aucun problème. Huit instances de
Lighthouse en parallèle se disputent le processeur et **faussent leurs propres
mesures**. D'où deux limites distinctes, et un avertissement au delà de 3.

### Aucun chiffre n'est inventé

Les économies affichées sont celles que Lighthouse calcule lui-même. Les
économies portant sur les mêmes fichiers ne sont jamais cumulées : convertir
une image en WebP, la redimensionner et la recompresser visent les mêmes
octets. Le poids évitable retient donc la plus grosse économie par famille de
fichiers, quitte à sous-estimer.

Aucun montant en euros n'est produit. L'effet sur le chiffre d'affaires
demande le panier moyen et le taux de transformation réels de l'entreprise :
c'est une question de rendez-vous, pas de calcul automatique. Si la colonne
`trafic_mensuel` est renseignée, le rapport ajoute une estimation de hausse du
taux de rebond, accompagnée de sa source et de sa réserve.

L'INP ne se mesure pas en laboratoire : il se calcule sur les interactions de
vrais visiteurs. Le rapport présente donc le TBT, son approximation officielle,
en le disant.

Pour l'INP réel, `--crux` interroge l'API Chrome UX Report de Google, seule
source de données de terrain. C'est la seule fonction de l'outil qui demande
une clé d'API (`--crux-key` ou la variable `CRUX_API_KEY`), et elle est donc
désactivée par défaut. Sur une TPE locale, l'API répondra le plus souvent que
le site n'a pas assez de trafic pour figurer dans ses relevés : c'est attendu,
le rapport n'en parle alors pas. Toute défaillance est silencieuse, aucune ne
peut interrompre un lot.

## Politesse

Cet outil sert à démarcher des entreprises. Il ne doit jamais donner à un
hébergeur l'impression d'un scraper agressif.

- `robots.txt` lu et respecté selon la RFC 9309. Un `404` autorise, un `5xx`
  ou un fichier injoignable entraînent l'abstention.
- `Crawl-delay` respecté et prioritaire sur le délai par défaut.
- Les requêtes vers un même domaine sont sérialisées et espacées d'au moins
  2 secondes, indépendamment de la concurrence globale.
- User-agent identifiable, à personnaliser dans `src/config.js` avec vos
  coordonnées.
- **Repli tracé** : beaucoup d'hébergements mutualisés écartent par défaut
  tout client qui ne ressemble pas à un navigateur, sans que le propriétaire
  du site l'ait décidé. Sur le lot d'essai, 3 cibles sur 16 étaient perdues
  ainsi, dont deux qui faisaient traîner la connexion jusqu'au délai maximal
  alors qu'un navigateur obtenait la page en 300 ms. L'outil demande donc
  d'abord avec son user-agent identifiable et, en cas de refus seulement,
  réessaie une fois en se présentant comme un navigateur. Le fait est inscrit
  dans le CSV (`ua_repli`) et dans le rapport client. `--no-repli-navigateur`
  pour désactiver.
  Le `robots.txt`, lui, reste respecté à la lettre dans tous les cas : c'est le
  seul signal par lequel un site exprime réellement sa politique.
- Une seule page visitée par site, plus quelques requêtes `HEAD` pour vérifier
  les pages légales.

`--ignore-robots` existe pour vos propres sites. Il affiche un avertissement.

## Reprise après interruption

Un lot de 300 sites dure des heures et sera interrompu. Chaque résultat est
écrit dès qu'il est prêt, par fichier temporaire puis renommage, afin qu'une
coupure ne laisse jamais un JSON tronqué. Une relance repart de là où elle
s'est arrêtée ; `--force` refait tout, `--max-age` ne refait que ce qui a
vieilli.

## Sorties

```
out/
├── index.html            le sommaire, point d'entrée pour parcourir le lot
├── brut/                 un JSON complet par site, réutilisable
├── rapports/             un HTML autonome par site, à envoyer au client
└── prospection.csv       la liste de démarchage, triée
```

`index.html` est un document interne : il porte le score de prospection, qui
n'apparaît dans aucun rapport client.

Les rapports HTML n'ont **aucune dépendance externe** : ni police, ni script,
ni image distante. Ils s'ouvrent hors ligne, s'impriment proprement en PDF et
passent les filtres de messagerie.

Le CSV est écrit avec le point-virgule et un BOM UTF-8, faute de quoi Excel en
locale française met toute la ligne dans une seule colonne et mange les
accents. `--csv-delimiter ,` pour revenir à la virgule.

## Limites connues

- Seule la page d'accueil est analysée. Un site dont les problèmes se
  concentrent ailleurs sera sous-évalué.
- Un bandeau de consentement injecté par un script tiers peut échapper à la
  détection. Le constat correspondant porte une réserve explicite.
- Certains hébergeurs répondent `403` à tout client qui n'est pas un
  navigateur. Ces sites ressortent comme injoignables.
- Les temps de chargement varient d'une mesure à l'autre. Les écarts
  importants sont significatifs, quelques dixièmes de seconde ne le sont pas.

## Licence

MIT
