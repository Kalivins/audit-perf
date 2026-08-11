/**
 * Feuille de style du rapport client.
 *
 * Tout est en ligne dans le fichier produit : aucune requete vers l'exterieur,
 * ni police, ni script, ni image distante. Le rapport doit s'ouvrir dans dix
 * ans, hors ligne, depuis une piece jointe, et s'imprimer correctement puisque
 * beaucoup de destinataires le liront en PDF.
 */

export const STYLES = `
:root {
  --encre: #1a1f2b;
  --encre-douce: #5a6478;
  --trait: #e2e6ee;
  --fond: #ffffff;
  --fond-doux: #f7f8fb;
  --accent: #1f4ed8;
  --rouge: #c0342b;
  --rouge-fond: #fdf1f0;
  --orange: #b5620a;
  --orange-fond: #fdf5ec;
  --vert: #1f7a45;
  --vert-fond: #f0f8f3;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0 1.25rem 4rem;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: var(--encre);
  background: var(--fond);
  -webkit-text-size-adjust: 100%;
}

.page { max-width: 820px; margin: 0 auto; }

h1, h2, h3 { line-height: 1.25; margin: 0; }
h1 { font-size: 1.75rem; letter-spacing: -0.01em; }
h2 { font-size: 1.25rem; margin: 2.75rem 0 1rem; }
h3 { font-size: 1.05rem; }
p { margin: 0 0 0.85rem; }

.entete {
  border-bottom: 3px solid var(--encre);
  padding: 2.5rem 0 1.25rem;
  margin-bottom: 2rem;
}
.entete .surtitre {
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--encre-douce);
  margin-bottom: 0.5rem;
}
.entete .url {
  font-size: 0.95rem;
  color: var(--encre-douce);
  word-break: break-all;
  margin-top: 0.4rem;
}
.entete .date { font-size: 0.85rem; color: var(--encre-douce); margin-top: 0.75rem; }

.verdict {
  background: var(--fond-doux);
  border-left: 4px solid var(--accent);
  padding: 1.25rem 1.4rem;
  margin: 1.5rem 0 0;
  border-radius: 0 6px 6px 0;
}
.verdict .chiffre {
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.verdict .chiffre.rouge { color: var(--rouge); }
.verdict .chiffre.orange { color: var(--orange); }
.verdict .chiffre.vert { color: var(--vert); }
.verdict .legende { color: var(--encre-douce); font-size: 0.95rem; }

.jauges {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin: 1.5rem 0;
}
.jauge { text-align: center; min-width: 88px; flex: 1 1 88px; }

/* La precision sur la note de referencement. Un filet a gauche plutot qu un
   encadre : elle explique une jauge affichee juste au-dessus et doit se lire
   dans la foulee, pas s isoler comme un avertissement. */
.note-seo {
  border-left: 3px solid var(--encre-douce);
  padding: 0.25rem 0 0.25rem 1rem;
  margin: 1.25rem 0;
}
.note-seo p { margin: 0 0 0.6rem; font-size: 0.95rem; }
.note-seo p:last-child { margin-bottom: 0; }
.jauge .nom {
  font-size: 0.75rem;
  color: var(--encre-douce);
  margin-top: 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.comparatif {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
  margin: 1rem 0;
}
.comparatif th, .comparatif td {
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--trait);
}
.comparatif th { font-weight: 600; color: var(--encre-douce); font-size: 0.8rem;
  text-transform: uppercase; letter-spacing: 0.05em; }
.comparatif td.nombre { text-align: right; font-variant-numeric: tabular-nums; }
.comparatif tr:last-child td { border-bottom: none; }

.probleme {
  border: 1px solid var(--trait);
  border-radius: 8px;
  padding: 1.25rem 1.4rem;
  margin-bottom: 1rem;
  break-inside: avoid;
}
.probleme > .tete {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}
.probleme .rang {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--trait);
  line-height: 1;
}
.probleme h3 { flex: 1 1 14rem; }

.etiquette {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  white-space: nowrap;
}
.etiquette.bloquant { background: var(--rouge-fond); color: var(--rouge); }
.etiquette.couteux { background: var(--orange-fond); color: var(--orange); }
.etiquette.corriger { background: var(--fond-doux); color: var(--encre-douce); }
.etiquette.gain { background: var(--vert-fond); color: var(--vert); }

.bloc { margin-bottom: 0.85rem; }
.bloc:last-child { margin-bottom: 0; }
.bloc .intitule {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--encre-douce);
  margin-bottom: 0.2rem;
}
.bloc.constat p { color: var(--encre-douce); font-size: 0.95rem; }
.bloc.cout p { font-size: 1rem; }

.reserve {
  font-size: 0.85rem;
  color: var(--encre-douce);
  background: var(--fond-doux);
  border-radius: 5px;
  padding: 0.6rem 0.8rem;
  margin-top: 0.85rem;
}

.gain-liste { list-style: none; padding: 0; margin: 0; }
.gain-liste li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 0;
  border-bottom: 1px solid var(--trait);
}
.gain-liste li:last-child { border-bottom: none; }
.gain-liste .valeur { font-weight: 700; font-variant-numeric: tabular-nums;
  white-space: nowrap; }

details {
  border: 1px solid var(--trait);
  border-radius: 8px;
  padding: 0.9rem 1.1rem;
  margin-bottom: 0.75rem;
}
details[open] { padding-bottom: 1.1rem; }
summary { cursor: pointer; font-weight: 600; }
summary::marker { color: var(--encre-douce); }
details .contenu { margin-top: 0.9rem; }

.reste { list-style: none; padding: 0; margin: 0; }
.reste li {
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--trait);
  display: flex;
  gap: 0.7rem;
  align-items: baseline;
  flex-wrap: wrap;
}
.reste li:last-child { border-bottom: none; }
.reste .titre { flex: 1 1 12rem; }
.reste .detail { color: var(--encre-douce); font-size: 0.9rem; flex-basis: 100%; }

.note {
  font-size: 0.85rem;
  color: var(--encre-douce);
  border-top: 1px solid var(--trait);
  margin-top: 3rem;
  padding-top: 1.25rem;
}
.note ul { padding-left: 1.1rem; margin: 0.4rem 0; }
.note li { margin-bottom: 0.3rem; }

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
  background: var(--fond-doux);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  word-break: break-all;
}

@media (max-width: 560px) {
  body { padding: 0 1rem 3rem; font-size: 15px; }
  .verdict .chiffre { font-size: 2rem; }
  .jauges { gap: 1rem; }
}

@media print {
  body { padding: 0; font-size: 11pt; }
  .probleme, details { break-inside: avoid; border-color: #ccc; }
  details { padding: 0; border: none; }
  details summary { display: none; }
  details .contenu { margin-top: 0; }
  h2 { break-after: avoid; }
  a { text-decoration: none; color: inherit; }
}
`;
