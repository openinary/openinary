import sharp from 'sharp';
import { TransformParams, ImageFormat } from './types';

interface ImageAnalysis {
  hasText: boolean;
  hasSharpEdges: boolean;
  isPhotographic: boolean;
  dominantColors: number;
  complexity: number;
}

interface OptimizationResult {
  buffer: Buffer;
  format: string;
  originalSize: number;
  optimizedSize: number;
  savings: number;
  compressionRatio: number;
}

export class Compression {
  private static readonly FORMAT_PRIORITIES = {
    avif: { quality: 0.9, savings: 0.7 },  // AVIF: Excellent compression, slightly lower quality acceptable
    webp: { quality: 0.95, savings: 0.6 }, // WebP: Good compression, high quality
    jpeg: { quality: 1.0, savings: 0.3 },  // JPEG: Standard compression, full quality
    png: { quality: 1.0, savings: 0.1 }    // PNG: Lossless, minimal compression
  };

  /**
   * Optimizes an image with intelligent compression
   */
  async optimizeForDelivery(
    inputPath: string, 
    params: TransformParams,
    userAgent?: string,
    acceptHeader?: string
  ): Promise<OptimizationResult> {
    
    const originalBuffer = await sharp(inputPath).toBuffer();
    const originalSize = originalBuffer.length;
    
    // 🧠 CONTENT ANALYSIS
    const analysis = await this.analyzeImage(inputPath);
    const metadata = await sharp(inputPath).metadata();
    
    // 🎯 OPTIMAL FORMAT DETERMINATION
    const optimalFormat = this.determineOptimalFormat(
      analysis, 
      originalSize, 
      userAgent, 
      acceptHeader,
      params.format
    );
    
    // 📐 OPTIMAL QUALITY CALCULATION
    const optimalQuality = this.calculateOptimalQuality(
      analysis, 
      originalSize, 
      optimalFormat
    );
        
    let pipeline = sharp(inputPath);
    
    // 🚀 PRELIMINARY OPTIMIZATIONS
    
    // Resolution reduction only for extremely large files (increased threshold)
    if (originalSize > 5 * 1024 * 1024) { // > 5MB
      const maxDimension = this.getMaxDimension(analysis);
      if (metadata.width! > maxDimension || metadata.height! > maxDimension) {
        pipeline = pipeline.resize(maxDimension, maxDimension, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }
    }
    
    // Remove metadata to save space
    pipeline = pipeline.withMetadata();
    
    // 🎨 FORMAT AND COMPRESSION APPLICATION
    switch (optimalFormat) {
      case 'avif':
        pipeline = pipeline.avif({
          quality: optimalQuality,
          effort: 1, 
          chromaSubsampling: '4:2:0'
        });
        break;
        
      case 'webp':
        pipeline = pipeline.webp({
          quality: optimalQuality,
          effort: 1, 
          smartSubsample: false // Disable for speed
        });
        break;
        
      case 'jpeg':
        pipeline = pipeline.jpeg({
          quality: optimalQuality,
          progressive: false, 
          mozjpeg: false,
          chromaSubsampling: '4:2:0'
        });
        break;
        
      case 'png':
        pipeline = pipeline.png({
          compressionLevel: 3, 
          adaptiveFiltering: false 
        });
        break;
        
      default:
        // PNG fallback for transparency (optimized for speed)
        pipeline = pipeline.png({
          compressionLevel: 3, // Faster compression
          adaptiveFiltering: false // Disable for speed
        });
    }
    
    const optimizedBuffer = await pipeline.toBuffer();
    const optimizedSize = optimizedBuffer.length;
    const savings = ((originalSize - optimizedSize) / originalSize) * 100;
    const compressionRatio = originalSize / optimizedSize;
        
    return {
      buffer: optimizedBuffer,
      format: optimalFormat,
      originalSize,
      optimizedSize,
      savings,
      compressionRatio
    };
  }

  /**
   * Analyzes image content to optimize compression (simplified for speed)
   */
  private async analyzeImage(inputPath: string): Promise<ImageAnalysis> {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    // Simplified analysis based only on metadata (no expensive stats calculation)
    const isPhotographic = metadata.channels! >= 3; // RGB or more channels
    const hasText = false; 
    const hasSharpEdges = false; // Skip expensive edge detection
    const complexity = 0.5; // Default medium complexity
    
    return {
      hasText,
      hasSharpEdges,
      isPhotographic,
      dominantColors: metadata.channels || 3,
      complexity
    };
  }

  /**
   * Determines optimal format based on content and browser support
   */
  private determineOptimalFormat(
    analysis: ImageAnalysis,
    fileSize: number,
    userAgent?: string,
    acceptHeader?: string,
    explicitFormat?: ImageFormat
  ): ImageFormat {
    
    // If format is explicitly specified, use it (TypeScript ensures it's valid)
    if (explicitFormat) {
      // Normalize jpg to jpeg
      return explicitFormat === 'jpg' ? 'jpeg' : explicitFormat;
    }
    
    // Check support for modern formats
    const supportsAVIF = this.supportsFormat('avif', userAgent, acceptHeader);
    const supportsWebP = this.supportsFormat('webp', userAgent, acceptHeader);
    
    // 🚀 NEW DEFAULT: Prefer AVIF by default if supported
    if (supportsAVIF) {
      return 'avif';
    }
    
    // Fallback to WebP if supported
    if (supportsWebP) {
      return 'webp';
    }
    
    // JPEG fallback for compatibility
    return 'jpeg';
  }

  /**
   * Calculates optimal quality based on content (simplified for speed)
   */
  private calculateOptimalQuality(
    analysis: ImageAnalysis,
    fileSize: number,
    format: string
  ): number {
    
    let baseQuality = 85;
    
    // Simplified format-specific adjustments
    switch (format) {
      case 'avif':
        baseQuality = 80; // AVIF can handle slightly lower quality
        break;
      case 'webp':
        baseQuality = 85;
        break;
      case 'jpeg':
        baseQuality = 90; // Higher quality for JPEG
        break;
      case 'png':
        return 100; // PNG is lossless, no quality adjustment needed
    }
    
    // Simplified size-based adjustment (less aggressive)
    if (fileSize > 5 * 1024 * 1024) baseQuality -= 5; // Only for very large files
    
    // Limits (higher minimum quality)
    return Math.max(70, Math.min(95, baseQuality));
  }

  /**
   * Determines maximum dimension based on content type
   */
  private getMaxDimension(analysis: ImageAnalysis): number {
    if (analysis.hasText) return 2560; // Text requires higher resolution
    if (analysis.isPhotographic) return 1920; // Standard photos
    return 1600; // Other content
  }

  /**
   * Checks browser support for a format
   */
  private supportsFormat(format: string, userAgent?: string, acceptHeader?: string): boolean {
    if (acceptHeader?.includes(`image/${format}`)) {
      return true;
    }
    
    if (!userAgent) return false;
    
    switch (format) {
      case 'avif':
        // Chrome 85+, Firefox 93+
        return /Chrome\/([8-9]\d|[1-9]\d{2,})/.test(userAgent) ||
               /Firefox\/([9-9]\d|[1-9]\d{2,})/.test(userAgent);
               
      case 'webp':
        // Very broad support now
        return !/MSIE|Trident/.test(userAgent) && // Not IE
               !/Edge\/1[0-8]/.test(userAgent);    // Not old Edge
               
      default:
        return true;
    }
  }
}