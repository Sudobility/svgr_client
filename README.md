# @sudobility/svgr_client

Typed API client SDK for the SVGR image-to-SVG service, with TanStack React
Query hooks. ESM-only, usable from both web and React Native (it talks to the
server through a platform-agnostic `NetworkClient`, so it ships no `fetch`
assumptions beyond raw file/SVG downloads).

## Installation

Published to **GitHub Packages** under the `@sudobility` scope (not the public
npm registry). Consumers need an `.npmrc` pointing the scope at GitHub Packages
and an auth token with `read:packages`:

```
@sudobility:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_PACKAGES_READ_TOKEN}
```

```bash
bun add @sudobility/svgr_client
```

Peer dependencies you must also install: `react` (18 or 19),
`@tanstack/react-query` (5), `@sudobility/types`, and `@sudobility/svgr_types`.

## Usage

```typescript
import { SvgrClient, useConvert, svgrKeys } from "@sudobility/svgr_client";

// Direct client usage. `networkClient` is a NetworkClient from
// @sudobility/types that handles auth headers and serialization.
const client = new SvgrClient({
  baseUrl: "https://api.svgr.app",
  networkClient,
  retry: { maxRetries: 3, baseDelayMs: 1000 }, // optional
  getAuthToken: async () => firebaseIdToken,    // optional, for live job WS
});

const res = await client.convert(base64Image, "photo.png", 5, true);
if (res.success && res.data) {
  const svg = await client.fetchSvg(res.data.cacheId);
}

// React hook usage
const convert = useConvert(client);
await convert.mutateAsync({ original: base64Image, filename: "photo.png", quality: 5 });
```

## API

### `SvgrClient`

Constructed with a `SvgrClientConfig`: `{ baseUrl, networkClient, retry?, getAuthToken? }`.

Methods (each throws `SvgrApiError` with an HTTP `status` on failure):

| Method | HTTP | Purpose |
| --- | --- | --- |
| `convert(original, filename?, quality?, transparentBg?, ocr?, mergePaths?, smooth?, imageType?)` | `POST /api/v1/convert` | Convert a base64 raster image to SVG; returns a cache id + dimensions |
| `fetchSvg(cacheId)` | `GET /api/v1/svg/:cacheId` | Fetch cached SVG text (raw `fetch`, not the `NetworkClient`) |
| `uploadImage(file)` | `POST /api/v1/images/upload` | Upload an image (`File` on web, or `{ buffer, filename, mimeType }`) |
| `createJob(request)` | `POST /api/v1/jobs` | Create a conversion job for an uploaded image |
| `getJobStatus(jobId)` | `GET /api/v1/jobs/:id` | Poll a job's status |
| `cancelJob(jobId)` | `POST /api/v1/jobs/:id/cancel` | Cancel a pending/running job |
| `subscribeJob(jobId, handlers)` | `WS /api/v1/jobs/:id/live` | Live job updates over WebSocket; returns an unsubscribe |
| `getJobsForImage(imageId)` | `GET /api/v1/jobs?imageId=` | List jobs for an image |
| `getUserImages()` | `GET /api/v1/images` | List the authenticated user's images + jobs |
| `getCommunities(language)` | `GET /api/v1/communities?lang=` | Public communities list |
| `fetchFile(filename)` | `GET /api/v1/files/:name` | Fetch a file as a `Blob` |

`convert` quality is 1–10 (default 5). `subscribeJob` is a no-op (callers fall
back to polling) when `WebSocket` is unavailable or no `getAuthToken` was given;
because a WebSocket cannot send an `Authorization` header it authenticates
in-band by sending the token as its first message.

### Hooks

TanStack React Query wrappers, each taking an `SvgrClient` instance:

- `useConvert(client)` — mutation; params `{ original, filename?, quality?, transparentBg?, ocr?, mergePaths?, smooth?, imageType? }`
- `useUploadImage(client)` — upload mutation
- `useCreateJob(client)` — create-job mutation
- `useCancelJob(client)` — cancel-job mutation; writes the cancelled job into the status cache
- `useJobStatus(client, jobId)` — query; live WS push + 2.5s polling that stops at a terminal status
- `useImageJobs(client, imageId)` — query for an image's jobs
- `useUserImages(client, enabled?)` — query for the user's images
- `useCommunities(client, language, enabled?)` — query (24h `staleTime`)
- `svgrKeys` — query-key factory (`all`, `convert()`, `jobs()`, `job(id)`, `imageJobs(id)`, `communities(lang)`)

### Types

Own types: `SvgrClientConfig`, `RetryConfig`, `JobLiveHandlers`,
`ConvertMutationParams`, and the `SvgrApiError` class. The package also
re-exports the API contract types from `@sudobility/svgr_types` (e.g.
`ConvertRequest`, `ConvertResult`, `JobResult`, `JobStatus`, `ImageWithJobs`,
`Community`, plus the `IMAGE_TYPES` / `COMMUNITY_PLATFORMS` constants).

## Development

```bash
bun install          # install deps
bun run build        # compile ESM + .d.ts to dist/ (tsc)
bun run dev          # tsc --watch
bun run test:unit    # run tests (Vitest)
bun run test:watch   # Vitest watch mode
bun run lint         # ESLint
bun run typecheck    # tsc --noEmit
bun run format       # Prettier write
bun run verify       # typecheck + lint + test + build (run before publishing)
```

> Tests run under **Vitest** via `bun run test:unit` — not `bun test` (there is
> no `test` script, and `bun test` would invoke Bun's own runner instead).

TypeScript is configured very strictly (`exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, etc.) and emits with `moduleResolution: NodeNext`.

## Related Packages

- `svgr_types` — shared API contract types (peer dependency)
- `svgr_lib` — shared business logic (consumes this package)
- `svgr_api` — backend API server this client calls
- `svgr_app` / `svgr_app_rn` — web and React Native apps

## License

BUSL-1.1
