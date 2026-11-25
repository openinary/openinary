import path from "path";
import { derivativeCachePath, deleteCachedFiles } from "../utils/cache";
import { deliveryTarget } from "../url/grammar";
import type { CloudStorage } from "../utils/storage/index";
import { determineOptimalFormatForCache } from "../url/negotiate";
import { Compression } from "../utils/image/compression";
import logger, { serializeError } from "../utils/logger";
import type { VideoJobQueue } from "../utils/video-job-queue";
import type { EnginePaths } from "../config/paths";
import {
  checkCloudCache,
  checkLocalCache,
  findSource,
  processImage,
  processVideo,
  saveToCaches,
} from "./transform-steps";
import { stageSource, type StagedSource } from "../utils/stage-source";
import { TRANSFORMATION_PRIORITY } from "../utils/video/config";
import { processingBody, processingHeaders } from "../eta";
import {
  contentTypeForFormat,
  determineOutputFormat,
  isTransformableImageExt,
  isVideoExt,
} from "../url/media-types";
import type { CombindedTransformParams } from "../types";
import { NotFoundError, ValidationError } from "../utils/errors";
import { derivativeEtag, sniffImageContentType } from "../utils/delivery-headers";

// libvips' wording for camera JPEGs browsers decode but libjpeg refuses.
const isRecoverableJpegError = (error: unknown, ext: string | undefined) => {
  if (!ext?.match(/^jpe?g$/i)) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /VipsJpeg:\s*Invalid SOS parameters for sequential JPEG/i.test(message);
};

const IMMUTABLE = "public, max-age=31536000, must-revalidate";

export interface TransformRequest {
  /** "/t/{transform}/{file}" */
  path: string;
  userAgent: string;
  acceptHeader?: string;
  /**
   * Read the original from here rather than from this instance's storage.
   * Changes where the source bytes come from and nothing else: the cache, on
   * both sides, stays this instance's own.
   */
  sourceUrl?: string;
}

/**
 * How a delivery was served, for anyone measuring it (the self-hosted API's
 * OpenTelemetry export reads it). Unset on errors.
 * - original: the stored file, untouched
 * - cache: a derivative rendered earlier
 * - transformed: rendered during this request
 * - queued: a video transcode handed to the job queue (202)
 */
export type TransformOutcome = "original" | "cache" | "transformed" | "queued";

export interface TransformResult {
  buffer?: Buffer;
  /** Set instead of buffer for large payloads served without buffering */
  stream?: ReadableStream<Uint8Array>;
  contentType: string;
  headers: Record<string, string>;
  /** 200 when unset */
  status?: number;
  outcome?: TransformOutcome;
}

const textResult = (status: number, message: string, headers: Record<string, string>): TransformResult => ({
  buffer: Buffer.from(message),
  contentType: "text/plain",
  status,
  headers,
});

export class TransformService {
  private compression = new Compression();

  constructor(
    private storage: CloudStorage | null,
    private queue: VideoJobQueue,
    private paths: EnginePaths,
  ) {}

  async transform(request: TransformRequest): Promise<TransformResult> {
    const { path: pathname, userAgent, acceptHeader, sourceUrl } = request;

    try {
      const { transform, filePath, params, defaultImage } = deliveryTarget(
        pathname.split("/").slice(2).join("/"),
      );
      const ext = filePath.split(".").pop()?.toLowerCase();

      const effectiveParams = this.effectiveParams(ext, params, userAgent, acceptHeader);
      const cachePath = derivativeCachePath(this.paths.cache, filePath, effectiveParams);

      const missing = await findSource(this.storage, this.paths.public, filePath, sourceUrl);
      if (missing) {
        await this.forgetDerivatives(filePath);
        if (defaultImage && defaultImage !== filePath && transform && !sourceUrl) {
          return await this.transformDefaultImage(request, transform, defaultImage);
        }
        throw new NotFoundError(missing);
      }

      // A bare /t/<path> URL delivers the untouched original for any stored type
      // (video, audio, 3D). Images always carry an auto-selected format at this
      // point, so they keep optimizing; transcoding only happens when the URL
      // asks for it, either with explicit parameters or with q_auto.
      if (Object.keys(effectiveParams).length === 0) {
        return { ...(await this.streamOriginal(filePath, ext ?? "", sourceUrl)), outcome: "original" };
      }

      const cached =
        (await checkCloudCache(this.storage, filePath, effectiveParams)) ??
        (await checkLocalCache(cachePath));
      if (cached) return this.cachedResult(cached, effectiveParams, ext);

      return await this.processFile(pathname, filePath, ext, effectiveParams, cachePath, request);
    } catch (error) {
      return this.errorResult(error, request);
    }
  }

  /**
   * d_: serve the default image, with the same transformation, in place of a
   * missing one. Rendered and cached under the default image's own path, so
   * the missing path never gets a cached derivative and the real file shows
   * up as soon as it is uploaded. The response is kept out of shared caches
   * for the same reason, like Cloudinary's placeholder responses.
   */
  private async transformDefaultImage(
    request: TransformRequest,
    segment: string,
    defaultImage: string,
  ): Promise<TransformResult> {
    const rest = segment
      .split(",")
      .filter((part) => part && !part.startsWith("d_"))
      .join(",");
    const path = rest ? `/t/${rest}/${defaultImage}` : `/t/${defaultImage}`;
    const result = await this.transform({ ...request, path });
    const served = !result.status || result.status === 200;
    if (served && result.contentType !== "text/plain") {
      result.headers = {
        ...result.headers,
        "Cache-Control": "private, max-age=60",
        "X-Default-Image": defaultImage,
      };
    }
    return result;
  }

  /** Params with the negotiated format an image without f_ is encoded in. */
  private effectiveParams(
    ext: string | undefined,
    params: CombindedTransformParams,
    userAgent?: string,
    acceptHeader?: string,
  ): CombindedTransformParams {
    if (params.format || !isTransformableImageExt(ext)) return { ...params };
    const format = determineOptimalFormatForCache(userAgent, acceptHeader, ext);
    return { ...params, format: format as CombindedTransformParams["format"] };
  }

  private cachedResult(
    buffer: Buffer,
    effectiveParams: CombindedTransformParams,
    ext: string | undefined,
  ): TransformResult {
    const headers: Record<string, string> = {
      "Cache-Control": IMMUTABLE,
      ETag: derivativeEtag(buffer),
      "Content-Length": buffer.length.toString(),
    };
    if (isVideoExt(ext)) headers["X-Video-Status"] = "ready";

    // Video sources derive the type from the requested output format: f_avif
    // on a .mp4 caches an image, and the path's extension would mislabel it
    // video/mp4 (browsers then render an empty player). Images: the cached
    // bytes say what they are; the path keeps the source extension, so
    // falling back to it labelled AVIF as image/jpeg.
    const contentType = isVideoExt(ext)
      ? contentTypeForFormat(determineOutputFormat(ext, effectiveParams.format).format)
      : (sniffImageContentType(buffer) ?? "");

    return { buffer, contentType, headers, outcome: "cache" };
  }

  private async processFile(
    requestPath: string,
    filePath: string,
    ext: string | undefined,
    effectiveParams: CombindedTransformParams,
    cachePath: string,
    { userAgent, acceptHeader, sourceUrl }: TransformRequest,
  ): Promise<TransformResult> {
    // Video transformations (non-thumbnail) are processed by the background
    // job queue, which stages its own source copy when it picks the job up,
    // possibly minutes later and long after a signed sourceUrl would have
    // expired. A remote source therefore covers images and video thumbnails,
    // not transcodes.
    if (isVideoExt(ext) && !effectiveParams.thumbnail) {
      return await this.queueVideo(requestPath, filePath, effectiveParams);
    }

    const isImage = isTransformableImageExt(ext);

    // Reached only when effectiveParams is non-empty - the bare-URL case
    // streams the original above. A transform was requested on a type nothing
    // here knows how to transform (audio, 3D, /t/w_500/doc.pdf). Rejected
    // before staging the source rather than serving the original, which would
    // hide a bug in whatever built this URL.
    if (!isImage && !isVideoExt(ext)) {
      const message = `${ext ? `.${ext}` : "This file type"} can't be transformed. Request /t/${filePath} for the original.`;
      return textResult(400, message, {
        "Content-Length": Buffer.byteLength(message).toString(),
        "Cache-Control": "no-store",
      });
    }

    // Checked before the source is staged, so a bad l_ never downloads it.
    if (effectiveParams.overlayPath && (await findSource(this.storage, this.paths.public, effectiveParams.overlayPath))) {
      throw new ValidationError(`Overlay image not found: ${effectiveParams.overlayPath}`);
    }

    let source: StagedSource | undefined;
    let overlay: StagedSource | undefined;
    try {
      source = await stageSource(this.storage, this.paths, filePath, sourceUrl);

      if (!isImage) {
        // A video thumbnail. transformVideo stages its own overlay.
        const result = await processVideo(source.path, effectiveParams, {
          storage: this.storage,
          paths: this.paths,
          settings: this.queue.videoSettings,
        });
        return {
          buffer: result.buffer,
          contentType: result.contentType,
          headers: {
            "Content-Length": result.buffer.length.toString(),
            "Cache-Control": IMMUTABLE,
          },
          outcome: "transformed",
        };
      }

      // The staged overlay lives in a copy of the params so the cache key and
      // ETag keep the public overlay path.
      let imageParams = effectiveParams;
      if (effectiveParams.overlayPath) {
        overlay = await stageSource(this.storage, this.paths, effectiveParams.overlayPath);
        imageParams = { ...effectiveParams, overlayPath: overlay.path };
      }

      let result: Awaited<ReturnType<typeof processImage>>;
      try {
        result = await processImage(source.path, imageParams, userAgent, acceptHeader, this.compression, this.paths.temp);
      } catch (error) {
        // Do not make the uploaded original unreachable: serve it untouched,
        // without writing it into the transformed cache under a misleading key.
        if (!isRecoverableJpegError(error, ext)) throw error;
        const fallback = await this.streamOriginal(filePath, ext ?? "jpg", sourceUrl);
        fallback.headers["Cache-Control"] = "no-store";
        fallback.headers["X-Transform-Fallback"] = "original";
        fallback.outcome = "original";
        logger.warn({ error: serializeError(error), filePath }, "JPEG transform failed; serving original");
        return fallback;
      }

      await saveToCaches(this.storage, filePath, effectiveParams, cachePath, result.buffer, result.contentType);

      const headers: Record<string, string> = {
        "Content-Length": result.buffer.length.toString(),
        "Cache-Control": IMMUTABLE,
        ETag: derivativeEtag(result.buffer),
      };
      const optimization = result.optimizationResult;
      if (optimization) {
        headers["X-Original-Size"] = optimization.originalSize.toString();
        headers["X-Optimized-Size"] = optimization.optimizedSize.toString();
        headers["X-Compression-Ratio"] = optimization.compressionRatio.toFixed(2);
        headers["X-Savings-Percent"] = optimization.savings.toFixed(1);
      }
      return { buffer: result.buffer, contentType: result.contentType, headers, outcome: "transformed" };
    } finally {
      await source?.cleanup();
      await overlay?.cleanup();
    }
  }

  private async queueVideo(
    requestPath: string,
    filePath: string,
    params: CombindedTransformParams,
  ): Promise<TransformResult> {
    let job = this.queue.getJobByPath(filePath, params);

    if (job?.status === "completed") {
      // Where the worker wrote it: jobs from older versions carry a path
      // derived differently from derivativeCachePath.
      const local = await checkLocalCache(job.cachePath);
      if (local) {
        return {
          buffer: local,
          contentType: contentTypeForFormat(
            determineOutputFormat(filePath.split(".").pop()?.toLowerCase(), params.format).format,
          ),
          headers: {
            "X-Video-Status": "ready",
            "Content-Length": local.length.toString(),
            "Cache-Control": IMMUTABLE,
          },
          outcome: "cache",
        };
      }
      // A cloud copy only reaches this point if the cloud cache check above
      // missed it; otherwise the output is gone and the job has to run again.
      if (!(this.storage && (await this.storage.exists(filePath, params)))) {
        logger.warn(
          { jobId: job.id, filePath, cachePath: job.cachePath },
          "Job marked as completed but cache missing - resetting to pending",
        );
        this.queue.resetJob(job.id);
        job = { ...job, status: "pending" };
      }
    }

    if (!job || job.status === "error" || job.status === "pending") {
      this.queue.enqueueTransform(filePath, params, TRANSFORMATION_PRIORITY);
    }

    // Never fall back to the original while the transform is pending: it would
    // ship content whose transformations (watermark, crop, trim) have not been
    // applied yet. Answer 202 and let the client poll /video-status, or simply
    // retry this URL once Retry-After has passed.
    const estimate = await this.queue.estimate(filePath, params);
    return {
      buffer: Buffer.from(
        JSON.stringify(
          processingBody(estimate, {
            message: "Video transformation is being processed",
            // Keeps the transformation segment: /video-status resolves the job
            // from the same path + params the transform URL carries
            statusUrl: requestPath.replace(/^\/t\//, "/video-status/"),
          }),
        ),
      ),
      contentType: "application/json",
      status: 202,
      outcome: "queued",
      headers: {
        "X-Video-Status": "processing",
        "Cache-Control": "no-store",
        ...processingHeaders(estimate),
      },
    };
  }

  /**
   * Streams the untouched original: it can weigh hundreds of MB, and
   * buffering it delays the first byte and competes with running ffmpeg jobs
   * for memory.
   */
  private async streamOriginal(
    filePath: string,
    ext: string,
    sourceUrl?: string,
  ): Promise<TransformResult> {
    // encodeURIComponent keeps ETag ASCII-only: header values must be a
    // ByteString, and file names can hold NFD-decomposed accents (> 255).
    const headers: Record<string, string> = {
      "Cache-Control": IMMUTABLE,
      ETag: `"${encodeURIComponent(filePath)}-original"`,
    };
    if (isVideoExt(ext)) headers["X-Video-Status"] = "original";

    try {
      let stream: ReadableStream<Uint8Array>;
      if (sourceUrl) {
        const response = await fetch(sourceUrl);
        if (!response.ok || !response.body) {
          throw new Error(`Source URL answered ${response.status}`);
        }
        const length = response.headers.get("content-length");
        if (length) headers["Content-Length"] = length;
        stream = response.body;
      } else if (this.storage) {
        const original = await this.storage.downloadOriginalStream(filePath);
        if (original.contentLength) {
          headers["Content-Length"] = original.contentLength.toString();
        }
        stream = original.stream;
      } else {
        const { createReadStream } = await import("fs");
        const { stat } = await import("fs/promises");
        const { Readable } = await import("stream");
        const localPath = path.join(this.paths.public, filePath);
        headers["Content-Length"] = (await stat(localPath)).size.toString();
        stream = Readable.toWeb(createReadStream(localPath)) as ReadableStream<Uint8Array>;
      }
      return { stream, contentType: contentTypeForFormat(ext), headers };
    } catch (error) {
      logger.error({ error: serializeError(error), filePath }, "Failed to serve original");
      throw new Error("Failed to load original");
    }
  }

  /** Drops every cached trace of a file that turned out to be missing. */
  private async forgetDerivatives(filePath: string): Promise<void> {
    this.storage?.invalidateAllCacheEntries(filePath);
    try {
      await deleteCachedFiles(this.paths.cache, filePath);
    } catch (error) {
      logger.warn({ error: serializeError(error), filePath }, "Failed to delete cached files");
    }
  }

  private errorResult(error: unknown, request: TransformRequest): TransformResult {
    const message = error instanceof Error ? error.message : String(error);

    // Bad transformation parameters are the client's mistake: 400 instead of
    // a 500 that would page us and invite retries.
    if (error instanceof ValidationError) {
      logger.info({ error: message, path: request.path }, error.name);
      return textResult(400, message, {
        "Content-Length": Buffer.byteLength(message).toString(),
        "Cache-Control": "no-store",
      });
    }

    if (!(error instanceof NotFoundError)) {
      logger.error({ error: serializeError(error), path: request.path }, "Processing error");
    }
    return textResult(error instanceof NotFoundError ? 404 : 500, `Processing failed: ${message}`, {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    });
  }
}
