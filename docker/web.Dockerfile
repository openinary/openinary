FROM node:20-alpine

# Installer pnpm globalement
RUN npm install -g pnpm

WORKDIR /app

# Copier les fichiers de configuration workspace
COPY pnpm-workspace.yaml ./
COPY package.json ./

# Copier les packages partagés
COPY packages/ ./packages/

# Copier les fichiers de dépendances du frontend
COPY apps/web/package.json ./apps/web/

# Installer les dépendances
RUN pnpm install

# Copier le code source du frontend
COPY apps/web/ ./apps/web/

# Build de l'application
WORKDIR /app/apps/web
RUN pnpm build

# Exposer le port
EXPOSE 3001

# Commande par défaut
CMD ["pnpm", "start"]