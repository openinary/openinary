FROM node:20

# Installer ffmpeg pour le traitement vidéo
RUN apt update && apt install -y ffmpeg

# Installer pnpm globalement
RUN npm install -g pnpm

WORKDIR /app

# Copier les fichiers de dépendances d'abord pour optimiser le cache Docker
COPY package.json pnpm-lock.yaml ./

# Installer les dépendances
RUN pnpm install

# Copier le reste du code source
COPY . .

# Créer le dossier cache s'il n'existe pas
RUN mkdir -p cache

# Exposer le port (optionnel mais bonne pratique)
EXPOSE 3000

# Commande par défaut
CMD ["pnpm", "dev"]
