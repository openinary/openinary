'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CDN_BASE_URL, formatFileSize, isImageFile, isVideoFile } from 'shared';

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transformedUrl, setTransformedUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setTransformedUrl('');
    }
  };

  const handleTransform = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    try {
      // Simuler l'upload et la transformation
      // Dans un vrai cas, vous uploaderiez le fichier vers l'API
      const params = isImageFile(selectedFile.name) 
        ? 'w:400/h:300/q:80/f:webp'
        : 'w:640/h:480/q:medium';
      
      const url = `${CDN_BASE_URL}/${params}/${selectedFile.name}`;
      setTransformedUrl(url);
    } catch (error) {
      console.error('Erreur lors de la transformation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🎨 Openinary
          </h1>
          <p className="text-xl text-gray-600">
            Plateforme de transformation d&apos;images et vidéos
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Monorepo avec API (port 3000) et Frontend (port 3001)
          </p>
        </header>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Section Upload */}
            <div>
              <h2 className="text-2xl font-semibold mb-4">📁 Sélectionner un fichier</h2>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-input"
                />
                <label
                  htmlFor="file-input"
                  className="cursor-pointer block"
                >
                  <div className="text-gray-500 mb-2">
                    Cliquez pour sélectionner une image ou vidéo
                  </div>
                  <div className="text-sm text-gray-400">
                    Formats supportés: JPG, PNG, WebP, MP4, WebM
                  </div>
                </label>
              </div>

              {selectedFile && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium">Fichier sélectionné:</h3>
                  <p className="text-sm text-gray-600">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500">
                    {formatFileSize(selectedFile.size)} • 
                    {isImageFile(selectedFile.name) ? ' Image' : isVideoFile(selectedFile.name) ? ' Vidéo' : ' Fichier'}
                  </p>
                  
                  <button
                    onClick={handleTransform}
                    disabled={isLoading}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLoading ? 'Transformation...' : '🔄 Transformer'}
                  </button>
                </div>
              )}
            </div>

            {/* Section Résultat */}
            <div>
              <h2 className="text-2xl font-semibold mb-4">✨ Résultat</h2>
              {transformedUrl ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-700 mb-2">URL générée:</p>
                    <code className="text-xs bg-white p-2 rounded block break-all">
                      {transformedUrl}
                    </code>
                  </div>
                  
                  {selectedFile && isImageFile(selectedFile.name) && (
                    <div className="border rounded-lg overflow-hidden">
                      <Image
                        src={transformedUrl}
                        alt="Transformed"
                        width={400}
                        height={300}
                        className="w-full h-auto"
                        onError={() => console.log("Erreur de chargement de l\\'image")}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  Sélectionnez un fichier et cliquez sur "Transformer" pour voir le résultat
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section API Status */}
        <div className="mt-8 bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">🔗 Status des Services</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium">API Backend</h3>
              <p className="text-sm text-gray-600">http://localhost:3000</p>
              <span className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                ✅ Actif
              </span>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium">Frontend Web</h3>
              <p className="text-sm text-gray-600">http://localhost:3001</p>
              <span className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                ✅ Actif
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
