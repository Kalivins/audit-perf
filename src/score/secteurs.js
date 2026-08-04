/**
 * Normalisation des secteurs d'activite.
 *
 * La colonne secteur du fichier de cibles est du texte libre, saisi a la main
 * ou recopie d'un annuaire. Deux usages en dependent : la comparaison entre
 * concurrents d'un meme metier, et les attentes d'automatisation, qui n'ont
 * rien de commun entre un restaurant et un plombier.
 *
 * Les mots-cles sont volontairement larges. Une cible non reconnue tombe dans
 * un secteur generique et ne recoit que les constats valables pour tous.
 */

export const SECTEURS = {
  restauration: {
    libelle: 'Restauration',
    motsCles: [
      'restaurant', 'restauration', 'brasserie', 'pizzeria', 'bistrot', 'bistro',
      'creperie', 'traiteur', 'bar', 'cafe', 'salon de the', 'food', 'burger',
      'sushi', 'japonais', 'italien',
    ],
  },
  alimentaire: {
    libelle: 'Commerce alimentaire',
    motsCles: [
      'boulangerie', 'patisserie', 'boucherie', 'charcuterie', 'fromagerie',
      'epicerie', 'primeur', 'poissonnerie', 'caviste', 'chocolaterie',
      'alimentaire',
    ],
  },
  batiment: {
    libelle: 'Artisanat du batiment',
    motsCles: [
      'plomberie', 'plombier', 'chauffagiste', 'chauffage', 'electricite',
      'electricien', 'menuiserie', 'menuisier', 'maconnerie', 'macon',
      'couverture', 'couvreur', 'peinture', 'peintre', 'carrelage', 'serrurerie',
      'terrassement', 'renovation', 'batiment', 'artisan', 'climatisation',
      'isolation', 'toiture',
    ],
  },
  automobile: {
    libelle: 'Automobile',
    motsCles: [
      'automobile', 'garage', 'carrosserie', 'mecanique', 'auto', 'pneu',
      'concession', 'moto', 'vehicule', 'depannage auto',
    ],
  },
  beaute: {
    libelle: 'Beaute et bien-etre',
    motsCles: [
      'coiffure', 'coiffeur', 'esthetique', 'institut', 'barbier', 'onglerie',
      'spa', 'massage', 'beaute',
    ],
  },
  sante: {
    libelle: 'Sante',
    motsCles: [
      'medecin', 'dentiste', 'kine', 'kinesitherapeute', 'osteopathe',
      'infirmier', 'pharmacie', 'opticien', 'podologue', 'sante', 'cabinet medical',
    ],
  },
  commerce: {
    libelle: 'Commerce',
    motsCles: [
      'boutique', 'magasin', 'commerce', 'pret a porter', 'fleuriste',
      'librairie', 'bijouterie', 'decoration', 'mobilier', 'jardinerie',
    ],
  },
  services: {
    libelle: 'Services',
    motsCles: [
      'avocat', 'comptable', 'expert-comptable', 'notaire', 'assurance',
      'immobilier', 'agence', 'conseil', 'formation', 'nettoyage', 'securite',
    ],
  },
};

export const SECTEUR_INCONNU = 'autre';

function deaccent(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * @param {string|null} secteurBrut valeur de la colonne secteur
 * @param {string|null} nom nom de l'entreprise, utilise en secours
 * @returns {string} identifiant de secteur canonique
 */
export function canoniser(secteurBrut, nom = null) {
  const foin = `${deaccent(secteurBrut)} ${deaccent(nom)}`;
  if (!foin.trim()) return SECTEUR_INCONNU;

  let meilleur = SECTEUR_INCONNU;
  let meilleureLongueur = 0;

  for (const [id, secteur] of Object.entries(SECTEURS)) {
    for (const mot of secteur.motsCles) {
      // Le mot-cle le plus long l'emporte : "depannage auto" doit primer sur
      // "auto", et "salon de the" sur "bar" quand les deux apparaissent.
      if (foin.includes(mot) && mot.length > meilleureLongueur) {
        meilleur = id;
        meilleureLongueur = mot.length;
      }
    }
  }

  return meilleur;
}

export function libelleSecteur(id) {
  return SECTEURS[id]?.libelle ?? 'Secteur non precise';
}
