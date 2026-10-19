/**
 * @module @sudobility/svgr_client
 *
 * API client SDK for SVGR with React Query hooks.
 *
 * Provides a typed HTTP client ({@link SvgrClient}) for calling the SVGR
 * image-to-SVG conversion API, along with TanStack Query hooks ({@link useConvert})
 * for seamless React integration.
 *
 * @example
 * ```typescript
 * import { SvgrClient, useConvert, svgrKeys } from '@sudobility/svgr_client';
 * ```
 */

// Network
export {
  SvgrClient,
  SvgrApiError,
  type SvgrClientConfig,
  type RetryConfig,
  type JobLiveHandlers,
} from "./network/SvgrClient.js";

// Hooks
export {
  useConvert,
  useUploadImage,
  useCreateJob,
  useCancelJob,
  useJobStatus,
  useImageJobs,
  useUserImages,
  useCommunities,
  svgrKeys,
} from "./hooks/index.js";
export type { ConvertMutationParams } from "./hooks/useConvert.js";

// Re-export types for convenience
export type {
  Community,
  CommunityPlatform,
  CommunitiesResponse,
  ConvertRequest,
  ConvertResult,
  ConvertResponse,
  BaseResponse,
  CreateJobRequest,
  CreateJobResponse,
  CancelJobResponse,
  ImageType,
  ImageUploadResult,
  ImageUploadResponse,
  ImageWithJobs,
  ImageListResponse,
  JobListResponse,
  JobResult,
  JobStatus,
  JobStatusResponse,
} from "@sudobility/svgr_types";
export { IMAGE_TYPES, COMMUNITY_PLATFORMS } from "@sudobility/svgr_types";
