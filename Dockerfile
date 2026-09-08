# Le Larbin — image de déploiement.
#
# Un seul processus sert la page et arbitre les parties. Ça tourne sur
# n'importe quel hébergeur qui accepte une image Docker et laisse passer les
# WebSockets : Render, Fly.io, Railway, Koyeb, ou un petit VPS.
#
#   docker build -t larbin .
#   docker run -p 5177:5177 larbin

# Debian plutôt qu'Alpine : quelques mégaoctets de plus, mais aucune surprise
# de binaire natif au moment d'assembler la page.
FROM node:24-slim

WORKDIR /app

# Les dépendances d'abord : cette couche ne change presque jamais, et le cache
# de build s'en trouve bien.
COPY package.json package-lock.json ./
RUN npm ci

# Puis le code, et l'assemblage de la page.
COPY . .
RUN npm run build

# L'hébergeur impose souvent son port par la variable PORT ; le serveur la lit.
ENV NODE_ENV=production
EXPOSE 5177

# Node 24 lit le TypeScript directement : rien à transpiler côté serveur.
CMD ["node", "src/reseau/serveur.ts"]
