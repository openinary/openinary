FROM node:20

# Installer ffmpeg pour le traitement vidéo
RUN apt update && apt install -y ffmpeg

# Installer pnpm globalement
RUN npm install -g pnpm

WORKDIR /app

# Copier les fichiers de configuration du monorepo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copier les packages partagés
COPY packages/ ./packages/

# Copier l'API
COPY apps/api/ ./apps/api/

# Installer toutes les dépendances du monorepo
RUN pnpm install --frozen-lockfile

# Créer les dossiers nécessaires
RUN mkdir -p apps/api/cache apps/api/public

# Changer vers le répertoire de l'API
WORKDIR /app/apps/api

# Compiler l'API
RUN pnpm build

# Exposer le port
EXPOSE 3000

# Commande par défaut pour la production
CMD ["pnpm", "start"]
