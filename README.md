# Image & Video Server avec Stockage Cloud

Ce serveur permet de traiter et servir des images et vidéos avec support pour le stockage cloud (AWS S3 ou Cloudflare R2).

## Fonctionnalités

- ✅ Redimensionnement d'images (JPEG, PNG, WebP, AVIF, GIF)
- ✅ Transformation de vidéos (MP4, MOV, WebM)
- ✅ Cache local et cloud (AWS S3 / Cloudflare R2) pour les performances
- ✅ Stockage cloud optionnel (recommandé)

## Configuration du Stockage Cloud

### 1. Copier le fichier d'environnement

```bash
cp .env.example .env
```

### 2. Configuration du Provider Cloud

⚠️ **Important** : Choisissez **UNE SEULE** option parmi les trois ci-dessous :

#### Option A : Mode Local (Aucun provider cloud)

Laissez le fichier `.env` vide ou ne définissez pas `STORAGE_PROVIDER` :

```env
# Aucune configuration cloud = mode local uniquement
# Les fichiers doivent être placés dans le dossier public/
```

#### Option B : AWS S3

Éditez le fichier `.env` :

```env
STORAGE_PROVIDER=aws
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=your_aws_access_key
STORAGE_SECRET_ACCESS_KEY=your_aws_secret_key
STORAGE_BUCKET_NAME=your-bucket-name
STORAGE_PUBLIC_URL=https://your-bucket-name.s3.us-east-1.amazonaws.com
```

**Étapes AWS :**
1. Créez un bucket S3 dans la console AWS
2. Configurez les permissions publiques si nécessaire
3. Créez un utilisateur IAM avec les permissions S3
4. Récupérez les clés d'accès

#### Option C : Cloudflare R2

Éditez le fichier `.env` :

```env
STORAGE_PROVIDER=cloudflare
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=your_r2_access_key
STORAGE_SECRET_ACCESS_KEY=your_r2_secret_key
STORAGE_BUCKET_NAME=your-bucket-name
STORAGE_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
STORAGE_PUBLIC_URL=https://your-custom-domain.com
```

**Étapes Cloudflare R2 :**
1. Créez un bucket R2 dans le dashboard Cloudflare
2. Générez des tokens API R2
3. Configurez un domaine personnalisé (optionnel)
4. Récupérez l'endpoint de votre compte

## Utilisation

### Démarrage

```bash
pnpm install
pnpm dev
```

### Exemples d'URLs

```
# Redimensionnement d'image
http://localhost:3000/cdn/resize:640x480/image.png

# Image avec qualité (0-100)
http://localhost:3000/cdn/resize:800x600/quality:80/image.jpg

# Transformation de vidéo
http://localhost:3000/cdn/resize:1280x720/video.mp4

# Vidéo avec qualité (0-100)
http://localhost:3000/cdn/resize:640x480/quality:50/video.mp4

# Combinaison de paramètres
http://localhost:3000/cdn/resize:800x600/quality:75/image.png
```

### Paramètres Disponibles

- **`resize:WIDTHxHEIGHT`** : Redimensionne l'image ou la vidéo
- **`quality:VALUE`** : Contrôle la qualité (0-100)
  - **Images** : Qualité JPEG (100 = meilleure qualité, plus gros fichier)
  - **Vidéos** : Qualité H.264 via CRF (100 = meilleure qualité, plus gros fichier)

## Fonctionnement du Cache

Le serveur utilise un système de cache adapté au mode configuré :

### Mode Cloud (AWS S3 ou Cloudflare R2)
1. **Cache cloud** : Les fichiers transformés sont stockés dans un dossier `cache/` dans votre bucket
2. **Cache local temporaire** : Utilisé uniquement pendant le traitement, supprimé immédiatement après upload
3. **Hiérarchie** : Cache cloud → Traitement à la demande → Upload vers cloud

### Mode Local
1. **Cache local uniquement** : Les fichiers transformés sont stockés dans le dossier `temp/`
2. **Hiérarchie** : Cache local → Traitement à la demande

### Modes de fonctionnement :

#### 🌐 Mode Cloud (Provider configuré)
Quand un provider cloud est configuré, le serveur utilise **EXCLUSIVEMENT** le stockage cloud :
1. **Cache cloud** : Vérifie d'abord si le fichier transformé existe dans `cache/` du bucket
2. **Cache local** : Si pas dans le cloud, vérifie le cache local
3. **Traitement** : Si pas en cache, télécharge le fichier original depuis le cloud, le traite et sauvegarde dans les deux caches

⚠️ **Important** : Les fichiers du dossier `public/` local sont **ignorés** quand un provider cloud est configuré.

#### 📁 Mode Local (Aucun provider configuré)
Quand aucun provider cloud n'est configuré :
1. **Cache local** : Vérifie le cache local
2. **Traitement** : Si pas en cache, traite le fichier depuis le dossier `public/` local

### Structure des fichiers :

#### 🌐 Mode Cloud (Provider configuré)
```
your-bucket/
├── cache/                   # Fichiers transformés (générés automatiquement)
│   ├── a1b2c3d4.jpg         # Image redimensionnée + hash des paramètres
│   ├── e5f6g7h8.mp4         # Vidéo transformée + hash des paramètres
│   └── ...
├── folderName/              # Vos dossiers
│   ├── image.png            # Images
│   ├── video.mp4            # Vidéos
│   ├── logo.jpg             # Autres fichiers
│   └── ...
└── autres-fichiers.jpg      # Fichiers à la racine
```

#### 📁 Mode Local (Aucun provider configuré)
```
media-api/
├── public/                  # TOUS vos fichiers originaux
│   ├── image.png            # Images
│   ├── video.mp4            # Vidéos
│   ├── logo.jpg             # Autres fichiers
│   └── ...
├── cache/                   # Cache local (généré automatiquement)
│   ├── hash1234             # Fichiers transformés
│   └── ...
└── src/                     # Code source
```

## Avantages

- **Performance** : Cache local pour un accès rapide
- **Scalabilité** : Stockage cloud pour partager entre instances
- **Sécurité** : Mode cloud exclusif pour éviter les conflits entre sources
- **Simplicité** : Un seul mode actif à la fois (local, cloudflare R2 ou AWS S3)
- **Flexibilité** : Fonctionne avec ou sans stockage cloud

## Variables d'Environnement

| Variable | Description | Requis |
|----------|-------------|---------|
| `STORAGE_PROVIDER` | `aws` ou `cloudflare` | Non |
| `STORAGE_REGION` | Région du stockage | Si provider défini |
| `STORAGE_ACCESS_KEY_ID` | Clé d'accès | Si provider défini |
| `STORAGE_SECRET_ACCESS_KEY` | Clé secrète | Si provider défini |
| `STORAGE_BUCKET_NAME` | Nom du bucket | Si provider défini |
| `STORAGE_ENDPOINT` | Endpoint (R2 uniquement) | Pour Cloudflare R2 |
| `STORAGE_PUBLIC_URL` | URL publique du bucket | Optionnel |

## Logs

Le serveur affiche des logs pour indiquer d'où viennent les fichiers :
- `📦 Serving from cloud cache` : Fichier servi depuis le cache cloud
- `💾 Serving from local cache` : Fichier servi depuis le cache local
- `☁️ Uploaded to cloud cache` : Fichier uploadé vers le cache cloud