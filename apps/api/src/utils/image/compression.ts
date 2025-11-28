import sharp from 'sharp';
import { TransformParams, ImageFormat, ImageAnalysis, OptimizationResult } from './types';
import logger from '../logger';

export class Compression {
  private static readonly FORMAT_PRIORITIES = {
    avif: { quality: 0.9, savings: 0.7 },  // AVIF: Excellent compression, slightly lower quality acceptable
    webp: { quality: 0.95, savings: 0.6 }, // WebP: Good compression, high quality
    jpeg: { quality: 1.0, savings: 0.3 },  // JPEG: Standard compression, full quality
    png: { quality: 1.0, savings: 0.1 }    // PNG: Lossless, minimal compression
  };

  /**
   * Optimizes an image with intelligent compression
   * If format is not explicitly specified, encodes in all supported formats and returns the smallest one
   */
  async optimizeForDelivery(
    inputPath: string, 
    params: TransformParams,
    userAgent?: string,
    acceptHeader?: string
  ): Promise<OptimizationResult> {
    
    const originalBuffer = await sharp(inputPath).toBuffer();
    const originalSize = originalBuffer.length;
    
    // CONTENT ANALYSIS
    const analysis = await this.analyzeImage(inputPath);
    const metadata = await sharp(inputPath).metadata();
    
    // If format is explicitly specified, use it directly (no size comparison needed)
    if (params.format) {
      const explicitFormat = params.format === 'jpg' ? 'jpeg' : params.format;
      const optimalQuality = this.calculateOptimalQuality(
        analysis, 
        originalSize, 
        explicitFormat
      );
      
      let pipeline = this.preparePipeline(inputPath, analysis, metadata, originalSize);
      
      // Apply the explicit format
      pipeline = this.applyFormat(pipeline, explicitFormat, optimalQuality);
      
      const optimizedBuffer = await pipeline.toBuffer();
      const optimizedSize = optimizedBuffer.length;
      const savings = ((originalSize - optimizedSize) / originalSize) * 100;
      const compressionRatio = originalSize / optimizedSize;
      
      return {
        buffer: optimizedBuffer,
        format: explicitFormat,
        originalSize,
        optimizedSize,
        savings,
        compressionRatio
      };
    }
    
    // FORMAT SIZE COMPARISON: Encode in all supported formats and compare sizes
    const supportsAVIF = this.supportsFormat('avif', userAgent, acceptHeader);
    const supportsWebP = this.supportsFormat('webp', userAgent, acceptHeader);
    
    logger.debug({ 
      userAgent, 
      acceptHeader, 
      supportsAVIF, 
      supportsWebP 
    }, 'Browser format support detection');
    
    const formatsToTest: ImageFormat[] = [];
    const originalFormat = metadata.format;
    const hasTransparency = metadata.hasAlpha;
    
    // Modern browsers: Test AVIF, WebP, and JPEG (plus PNG if original is PNG)
    if (supportsAVIF) {
      formatsToTest.push('avif', 'webp', 'jpeg');
      // If original is PNG, also test PNG to compare sizes (AVIF/WebP support transparency too)
      if (originalFormat === 'png') {
        formatsToTest.push('png');
        logger.debug('Testing formats: AVIF, WebP, JPEG, PNG (original is PNG)');
      } else {
        logger.debug('Testing formats: AVIF, WebP, JPEG');
      }
    }
    // Browsers with WebP but not AVIF: Test WebP and JPEG (plus PNG if original is PNG)
    else if (supportsWebP) {
      formatsToTest.push('webp', 'jpeg');
      // If original is PNG, also test PNG to compare sizes (WebP supports transparency)
      if (originalFormat === 'png') {
        formatsToTest.push('png');
        logger.debug('Testing formats: WebP, JPEG, PNG (original is PNG)');
      } else {
        logger.debug('Testing formats: WebP, JPEG');
      }
    }
    // Older browsers: Use JPEG/PNG (keep original format if PNG for transparency)
    else {
      // Preserve PNG for transparency, otherwise use JPEG
      if (originalFormat === 'png' && hasTransparency) {
        formatsToTest.push('png');
        logger.debug('Testing format: PNG (preserving transparency, legacy browser)');
      } else {
        formatsToTest.push('jpeg');
        logger.debug('Testing format: JPEG (legacy browser)');
      }
    }
    
    // Encode in all formats and compare sizes
    const results: Array<{ format: ImageFormat; buffer: Buffer; size: number }> = [];
    
    for (const format of formatsToTest) {
      try {
        const quality = this.calculateOptimalQuality(analysis, originalSize, format);
        let pipeline = this.preparePipeline(inputPath, analysis, metadata, originalSize);
        pipeline = this.applyFormat(pipeline, format, quality);
        
        const buffer = await pipeline.toBuffer();
        results.push({
          format,
          buffer,
          size: buffer.length
        });
      } catch (error) {
        // If encoding fails for a format, skip it
        logger.debug({ error, format }, `Failed to encode in ${format}, skipping`);
      }
    }
    
    // Find the smallest format
    if (results.length === 0) {
      // Fallback: use JPEG
      const quality = this.calculateOptimalQuality(analysis, originalSize, 'jpeg');
      let pipeline = this.preparePipeline(inputPath, analysis, metadata, originalSize);
      pipeline = this.applyFormat(pipeline, 'jpeg', quality);
      const buffer = await pipeline.toBuffer();
      
      return {
        buffer,
        format: 'jpeg',
        originalSize,
        optimizedSize: buffer.length,
        savings: ((originalSize - buffer.length) / originalSize) * 100,
        compressionRatio: originalSize / buffer.length
      };
    }
    
    // Sort by size and pick the smallest
    results.sort((a, b) => a.size - b.size);
    const bestResult = results[0];
    
    // Normalize format (jpg -> jpeg)
    const normalizedFormat = bestResult.format === 'jpg' ? 'jpeg' : bestResult.format;
    
    logger.debug({ 
      testedFormats: results.map(r => ({ format: r.format, size: r.size })),
      selectedFormat: normalizedFormat,
      selectedSize: bestResult.size,
      originalSize
    }, 'Format size comparison results');
    
    const savings = ((originalSize - bestResult.size) / originalSize) * 100;
    const compressionRatio = originalSize / bestResult.size;
    
    return {
      buffer: bestResult.buffer,
      format: normalizedFormat,
      originalSize,
      optimizedSize: bestResult.size,
      savings,
      compressionRatio
    };
  }
  
  /**
   * Prepares the base pipeline with preliminary optimizations
   */
  private preparePipeline(
    inputPath: string,
    analysis: ImageAnalysis,
    metadata: sharp.Metadata,
    originalSize: number
  ): sharp.Sharp {
    let pipeline = sharp(inputPath);
    
    // Resolution reduction only for extremely large files
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
    
    return pipeline;
  }
  
  /**
   * Applies format encoding to the pipeline
   */
  private applyFormat(
    pipeline: sharp.Sharp,
    format: ImageFormat,
    quality: number
  ): sharp.Sharp {
    switch (format) {
      case 'avif':
        return pipeline.avif({
          quality,
          effort: 1, 
          chromaSubsampling: '4:2:0'
        });
        
      case 'webp':
        return pipeline.webp({
          quality,
          effort: 1, 
          smartSubsample: false
        });
        
      case 'jpeg':
      case 'jpg':
        return pipeline.jpeg({
          quality,
          progressive: false, 
          mozjpeg: false,
          chromaSubsampling: '4:2:0'
        });
        
      case 'png':
        return pipeline.png({
          compressionLevel: 3, 
          adaptiveFiltering: false 
        });
        
      default:
        // PNG fallback
        return pipeline.png({
          compressionLevel: 3,
          adaptiveFiltering: false
        });
    }
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
    
    // NEW DEFAULT: Prefer AVIF by default if supported
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
   * Determines the optimal format for a browser without doing full optimization
   * This is used for cache key generation
   */
  determineOptimalFormatForCache(
    userAgent?: string,
    acceptHeader?: string,
    originalFormat?: string
  ): string {
    // If format is explicitly specified, we wouldn't call this, but handle it anyway
    const supportsAVIF = this.supportsFormat('avif', userAgent, acceptHeader);
    const supportsWebP = this.supportsFormat('webp', userAgent, acceptHeader);
    
    // Prefer AVIF if supported (best compression)
    if (supportsAVIF) {
      return 'avif';
    }
    
    // Fallback to WebP if supported
    if (supportsWebP) {
      return 'webp';
    }
    
    // For legacy browsers, preserve PNG if original is PNG (for transparency)
    // Otherwise use JPEG
    if (originalFormat === 'png') {
      return 'png';
    }
    
    return 'jpeg';
  }

  /**
   * Checks browser support for a format
   */
  private supportsFormat(format: string, userAgent?: string, acceptHeader?: string): boolean {
    // First check Accept header - most reliable method
    if (acceptHeader) {
      const acceptLower = acceptHeader.toLowerCase();
      if (format === 'avif' && acceptLower.includes('image/avif')) {
        return true;
      }
      if (format === 'webp' && acceptLower.includes('image/webp')) {
        return true;
      }
    }
    
    if (!userAgent) {
      // If no user agent, assume modern browser supports AVIF and WebP
      // This handles cases where Accept header might not be sent
      return format === 'avif' || format === 'webp';
    }
    
    const ua = userAgent.toLowerCase();
    
    switch (format) {
      case 'avif':
        // Chrome 85+ (released Aug 2020), Firefox 93+ (released Oct 2021), Safari 16+ (released Sep 2022), Edge 122+
        return (
          (ua.includes('chrome') && !ua.includes('edg') && parseInt(ua.match(/chrome\/(\d+)/)?.[1] || '0') >= 85) ||
          (ua.includes('firefox') && parseInt(ua.match(/firefox\/(\d+)/)?.[1] || '0') >= 93) ||
          (ua.includes('safari') && !ua.includes('chrome') && parseInt(ua.match(/version\/(\d+)/)?.[1] || '0') >= 16) ||
          (ua.includes('edg') && parseInt(ua.match(/edg\/(\d+)/)?.[1] || '0') >= 122)
        );
               
      case 'webp':
        // Very broad support now - almost all modern browsers
        return !ua.includes('msie') && 
               !ua.includes('trident') && 
               !(ua.includes('edge') && parseInt(ua.match(/edge\/(\d+)/)?.[1] || '0') < 18);
               
      default:
        return true;
    }
  }
}