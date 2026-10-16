import type { NetworkClient } from "@sudobility/types";
import type {
  BaseResponse,
  Community,
  ConvertResult,
  CreateJobRequest,
  ImageType,
  ImageUploadResult,
  ImageWithJobs,
  JobResult,
} from "@sudobility/svgr_types";

/**
 * Configuration for creating an {@link SvgrClient} instance.
 *
 * @interface SvgrClientConfig
 * @property {string} baseUrl - The base URL of the SVGR API server (e.g., `https://api.svgr.app`)
 * @property {NetworkClient} networkClient - A platform-agnostic HTTP client from `@sudobility/types`
 *   that handles authentication headers and request serialization
 *
 * @example
 * ```typescript
 * const config: SvgrClientConfig = {
 *   baseUrl: 'https://api.svgr.app',
 *   networkClient: myNetworkClient,
 * };
 * const client = new SvgrClient(config);
 * ```
 */
export interface SvgrClientConfig {
  /** The base URL of the SVGR API server (e.g., `https://api.svgr.app`) */
  baseUrl: string;
  /** Platform-agnostic HTTP client that handles auth and serialization */
  networkClient: NetworkClient;
  /**
   * Optional retry configuration for failed requests.
   * When provided, the client will retry failed network requests
   * using exponential backoff.
   */
  retry?: RetryConfig;
}

/**
 * Configuration for automatic retry of failed network requests.
 *
 * @interface RetryConfig
 * @property {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @property {number} baseDelayMs - Base delay in milliseconds before first retry (default: 1000).
 *   Subsequent retries use exponential backoff: `baseDelayMs * 2^attempt`.
 * @property {number[]} [retryableStatuses] - HTTP status codes that should trigger a retry.
 *   Defaults to [408, 429, 500, 502, 503, 504].
 *
 * @example
 * ```typescript
 * const retryConfig: RetryConfig = {
 *   maxRetries: 3,
 *   baseDelayMs: 1000,
 *   retryableStatuses: [429, 500, 502, 503, 504],
 * };
 * ```
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in milliseconds before first retry (default: 1000) */
  baseDelayMs: number;
  /** HTTP status codes that should trigger a retry. Defaults to [408, 429, 500, 502, 503, 504] */
  retryableStatuses?: number[];
}

/** Default HTTP status codes considered retryable */
const DEFAULT_RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

/**
 * Build a {@link Blob} from an {@link ArrayBuffer} in a way that works on both
 * the web and React Native.
 *
 * React Native's `Blob` implementation cannot be constructed from an
 * `ArrayBuffer`/`ArrayBufferView` — `new Blob([arrayBuffer])` throws
 * "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported".
 * Routing the bytes through a `data:` URL avoids that: `fetch()` returns a
 * proper platform `Blob` on every runtime. On the web this path is equivalent
 * to the direct constructor.
 */
async function bufferToBlob(
  buffer: ArrayBuffer,
  mimeType: string,
): Promise<Blob> {
  const bytes = new Uint8Array(buffer);
  // Chunked to avoid a call-stack overflow from spreading a large array.
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const dataUrl = `data:${mimeType};base64,${btoa(binary)}`;
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * Error thrown when the SVGR API returns a non-successful HTTP response.
 *
 * Extends the built-in `Error` class with an HTTP `status` code property,
 * allowing consumers to differentiate between different error types.
 *
 * @extends Error
 * @property {number} status - The HTTP status code from the API response
 * @property {string} message - Human-readable error description
 * @property {string} name - Always `"SvgrApiError"` for type identification
 *
 * @example
 * ```typescript
 * try {
 *   await client.convert(imageData);
 * } catch (error) {
 *   if (error instanceof SvgrApiError) {
 *     console.error(`API error ${error.status}: ${error.message}`);
 *     if (error.status === 429) {
 *       // Handle rate limiting
 *     }
 *   }
 * }
 * ```
 */
export class SvgrApiError extends Error {
  constructor(
    /** The HTTP status code from the API response */
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "SvgrApiError";
  }
}

/**
 * HTTP client for the SVGR image-to-SVG conversion API.
 *
 * Provides a typed interface for calling the SVGR conversion endpoint.
 * Uses a platform-agnostic `NetworkClient` for HTTP communication,
 * making it usable in both web and React Native environments.
 *
 * @example
 * ```typescript
 * import { SvgrClient } from '@sudobility/svgr_client';
 *
 * const client = new SvgrClient({
 *   baseUrl: 'https://api.svgr.app',
 *   networkClient: myNetworkClient,
 * });
 *
 * const response = await client.convert(base64Image, 'logo.png', 7, true);
 * const svg = await client.fetchSvg(response.data!.cacheId);
 * ```
 *
 * @example
 * ```typescript
 * // With retry configuration
 * const client = new SvgrClient({
 *   baseUrl: 'https://api.svgr.app',
 *   networkClient: myNetworkClient,
 *   retry: { maxRetries: 3, baseDelayMs: 1000 },
 * });
 * ```
 */
export class SvgrClient {
  private readonly baseUrl: string;
  private readonly networkClient: NetworkClient;
  private readonly retryConfig: RetryConfig | undefined;

  constructor(config: SvgrClientConfig) {
    this.baseUrl = config.baseUrl;
    this.networkClient = config.networkClient;
    this.retryConfig = config.retry;
  }

  /**
   * Convert a raster image to SVG format.
   *
   * Sends a POST request to `/api/v1/convert` with the image data and
   * optional conversion parameters. Returns a `BaseResponse<ConvertResult>`
   * containing a cache ID and original image dimensions on success.
   * Use {@link fetchSvg} with the cache ID to retrieve the SVG content.
   *
   * @param original - Base64-encoded raster image data (PNG, JPG, WEBP, BMP, or GIF)
   * @param filename - Optional filename for metadata or audit purposes
   * @param quality - Conversion quality level from 1 to 10 (1 = smallest, 10 = highest fidelity). Default: 5
   * @param transparentBg - If true, removes the background from the SVG. Default: false
   * @param imageType - Optional shared preprocessing profile such as `photo`, `gray_scale`, or `design`
   * @returns A promise resolving to a `BaseResponse<ConvertResult>` with the SVG output
   * @throws {SvgrApiError} When the API returns a non-successful response (includes HTTP status code)
   *
   * @example
   * ```typescript
   * const response = await client.convert(
   *   'data:image/png;base64,...',
   *   'logo.png',
   *   7,
   *   true,
   * );
   * if (response.success && response.data) {
   *   const svg = await client.fetchSvg(response.data.cacheId);
   *   console.log(svg);                   // SVG string
   *   console.log(response.data.width);   // Original width in px
   *   console.log(response.data.height);  // Original height in px
   * }
   * ```
   */
  async convert(
    original: string,
    filename?: string,
    quality?: number,
    transparentBg?: boolean,
    ocr?: boolean,
    mergePaths?: boolean,
    smooth?: number,
    imageType?: ImageType,
  ): Promise<BaseResponse<ConvertResult>> {
    const makeRequest = () =>
      this.networkClient.post<BaseResponse<ConvertResult>>(
        `${this.baseUrl}/api/v1/convert`,
        {
          original,
          filename,
          quality,
          transparentBg,
          ocr,
          mergePaths,
          smooth,
          imageType,
        },
        { timeout: 120000 },
      );

    const response = this.retryConfig
      ? await this.withRetry(makeRequest, this.retryConfig)
      : await makeRequest();

    if (!response.ok || !response.data) {
      const errorData = response.data as { error?: string } | null | undefined;
      throw new SvgrApiError(
        response.status,
        errorData?.error || "Conversion failed",
      );
    }

    return response.data;
  }

  /**
   * Fetch a cached SVG by its cache ID.
   *
   * Sends a GET request to `/api/v1/svg/:cacheId` which returns the raw SVG
   * content with `Content-Type: image/svg+xml`. Uses native `fetch` instead
   * of the `NetworkClient` because the response is raw SVG text, not JSON.
   *
   * @param cacheId - The cache ID returned from a successful {@link convert} call
   * @returns The SVG content as a string
   * @throws {SvgrApiError} When the fetch fails or returns a non-OK status
   *
   * @example
   * ```typescript
   * const response = await client.convert(imageData, 'logo.png');
   * if (response.success && response.data) {
   *   const svg = await client.fetchSvg(response.data.cacheId);
   *   console.log(svg); // '<svg xmlns="http://www.w3.org/2000/svg">...</svg>'
   * }
   * ```
   */
  async fetchSvg(cacheId: string): Promise<string> {
    const url = `${this.baseUrl}/api/v1/svg/${cacheId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new SvgrApiError(response.status, "Failed to fetch SVG");
    }
    return response.text();
  }

  /**
   * Upload an image file for persistent storage.
   * Uses networkClient.post with FormData (handles auth automatically).
   */
  async uploadImage(
    file: File | { buffer: ArrayBuffer; filename: string; mimeType: string },
  ): Promise<BaseResponse<ImageUploadResult>> {
    const formData = new FormData();
    if (typeof File !== "undefined" && file instanceof File) {
      formData.append("image", file);
    } else {
      const { buffer, mimeType, filename } = file as {
        buffer: ArrayBuffer;
        filename: string;
        mimeType: string;
      };
      const blob = await bufferToBlob(buffer, mimeType);
      formData.append("image", blob, filename);
    }

    const url = `${this.baseUrl}/api/v1/images/upload`;
    const response = await this.networkClient.post<
      BaseResponse<ImageUploadResult>
    >(url, formData, { timeout: 60000 });

    if (!response.ok) {
      throw new SvgrApiError(
        response.status,
        (response.data as { error?: string })?.error ?? "Upload failed",
      );
    }

    return response.data as BaseResponse<ImageUploadResult>;
  }

  /** Create a conversion job for an uploaded image. */
  async createJob(request: CreateJobRequest): Promise<BaseResponse<JobResult>> {
    const url = `${this.baseUrl}/api/v1/jobs`;
    const response = await this.networkClient.post<BaseResponse<JobResult>>(
      url,
      request,
    );

    if (!response.ok) {
      throw new SvgrApiError(
        response.status,
        (response.data as { error?: string })?.error ?? "Job creation failed",
      );
    }

    return response.data as BaseResponse<JobResult>;
  }

  /** Get the current status of a conversion job. */
  async getJobStatus(jobId: string): Promise<BaseResponse<JobResult>> {
    const url = `${this.baseUrl}/api/v1/jobs/${jobId}`;
    const response = await this.networkClient.get<BaseResponse<JobResult>>(url);

    if (!response.ok) {
      throw new SvgrApiError(
        response.status,
        (response.data as { error?: string })?.error ??
          "Failed to get job status",
      );
    }

    return response.data as BaseResponse<JobResult>;
  }

  /** List all conversion jobs for a given image. */
  async getJobsForImage(imageId: string): Promise<BaseResponse<JobResult[]>> {
    const url = `${this.baseUrl}/api/v1/jobs?imageId=${encodeURIComponent(imageId)}`;
    const response =
      await this.networkClient.get<BaseResponse<JobResult[]>>(url);

    if (!response.ok) {
      throw new SvgrApiError(
        response.status,
        (response.data as { error?: string })?.error ?? "Failed to list jobs",
      );
    }

    return response.data as BaseResponse<JobResult[]>;
  }

  /** Fetch a file by name (SVG, JPEG preview, or uploaded image). Returns Blob. */
  async fetchFile(filename: string): Promise<Blob> {
    const url = `${this.baseUrl}/api/v1/files/${encodeURIComponent(filename)}`;
    const response = await this.networkClient.get<Blob>(url);

    if (!response.ok) {
      throw new SvgrApiError(response.status, "File not found");
    }

    return response.data as Blob;
  }

  /** Fetch communities for a given language. Public endpoint, no auth required. */
  async getCommunities(language: string): Promise<BaseResponse<Community[]>> {
    const url = `${this.baseUrl}/api/v1/communities?lang=${encodeURIComponent(language)}`;
    const response =
      await this.networkClient.get<BaseResponse<Community[]>>(url);

    if (!response.ok) {
      throw new SvgrApiError(
        response.status,
        (response.data as { error?: string })?.error ??
          "Failed to fetch communities",
      );
    }

    return response.data as BaseResponse<Community[]>;
  }

  /** List all images with their jobs for the authenticated user. */
  async getUserImages(): Promise<BaseResponse<ImageWithJobs[]>> {
    const url = `${this.baseUrl}/api/v1/images`;
    const response =
      await this.networkClient.get<BaseResponse<ImageWithJobs[]>>(url);

    if (!response.ok) {
      throw new SvgrApiError(
        response.status,
        (response.data as { error?: string })?.error ?? "Failed to list images",
      );
    }

    return response.data as BaseResponse<ImageWithJobs[]>;
  }

  /**
   * Execute a request function with exponential backoff retry.
   *
   * @param fn - The async function to retry
   * @param config - Retry configuration
   * @returns The result of the successful request
   * @throws The last error encountered after all retries are exhausted
   */
  private async withRetry<T>(
    fn: () => Promise<{ ok: boolean; status: number } & T>,
    config: RetryConfig,
  ): Promise<{ ok: boolean; status: number } & T> {
    const retryableStatuses =
      config.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

    let response = await fn();

    for (let attempt = 0; attempt < config.maxRetries; attempt++) {
      if (response.ok || !retryableStatuses.includes(response.status)) {
        return response;
      }

      const delay = config.baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));

      response = await fn();
    }

    return response;
  }
}
