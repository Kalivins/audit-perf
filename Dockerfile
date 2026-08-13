# L'atelier de mesure, pour que les chiffres cessent de dépendre du poste.
#
# Trois campagnes lancées le 12 août 2026 depuis un portable ont rendu trois
# classements différents, avec 21 points d'écart sur des pages identiques. La
# machine était à 73 % de CPU. Un chiffre mesuré dans ces conditions ne se
# défend pas devant un client qui le conteste, et c'est pourtant le seul
# argument du rapport.
#
# Ici Chrome est fixé par le gestionnaire de paquets et l'environnement est le
# même à chaque exécution. Les notes seront différentes de celles du portable :
# c'est attendu, et c'est justement l'intérêt. Ce qui compte est qu'elles soient
# comparables entre elles.

FROM node:22-bookworm-slim

# Chromium des dépôts Debian plutôt qu'un binaire téléchargé : il est signé,
# corrigé par les mises à jour de sécurité, et sa version se lit dans l'image.
# Les polices comptent : sans elles, Chrome substitue au hasard, le rendu change
# et le décalage de mise en page se mesure faux.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-dejavu-core \
      ca-certificates \
      dumb-init \
 && rm -rf /var/lib/apt/lists/*

# chrome-launcher cherche un navigateur aux emplacements habituels et ne connaît
# pas celui de Debian. Sans cette variable, il annonce qu'aucun Chrome n'est
# installé alors qu'il est là.
ENV CHROME_PATH=/usr/bin/chromium

# Le bac à sable de Chrome réclame des espaces de noms utilisateur que le profil
# seccomp de Docker interdit. La soupape est lue par le code, jamais gravée dans
# lui : le poste de travail garde son bac à sable.
ENV CHROME_FLAGS_SUP=--no-sandbox

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY bin ./bin
COPY data ./data

# Un utilisateur sans privilèges. Chrome tourne sans bac à sable ici, donc c'est
# la seule barrière qui reste entre une page web hostile et la machine qui sert
# le site en production.
RUN useradd --create-home --shell /bin/bash mesureur \
 && mkdir -p /travail /sortie \
 && chown -R mesureur:mesureur /app /travail /sortie
USER mesureur

# dumb-init pour que Ctrl+C et docker stop tuent vraiment Chrome. Sans lui, un
# navigateur orphelin survit à la campagne et occupe la mémoire du serveur.
ENTRYPOINT ["dumb-init", "--", "node", "/app/bin/audit.js"]
CMD ["--help"]
