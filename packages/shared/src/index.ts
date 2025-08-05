// Export des types et utilitaires partagés
export * from './types';

// Constantes partagées
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
export const CDN_BASE_URL = `${API_BASE_URL}/cdn`;

// Utilitaires partagés
export const formatFileSize = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

export const isImageFile = (filename: string): boolean => {
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|avif)$/i;
  return imageExtensions.test(filename);
};

export const isVideoFile = (filename: string): boolean => {
  const videoExtensions = /\.(mp4|mov|webm|avi|mkv)$/i;
  return videoExtensions.test(filename);
};