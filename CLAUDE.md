# SVGR Client

> **Git policy — never auto-commit or auto-push.** Leave your work in the working tree.
> Run `git commit`, `git push`, `gh pr create`, or push scripts **only when the user
> explicitly asks in that turn**. Approval for an earlier change does not carry forward,
> and finishing a task is not permission to commit it. Stay on the current branch (`main`);
> do not create feature branches.

Typed API client SDK for the SVGR image-to-SVG service, with TanStack React Query hooks.

**npm name**: `@sudobility/svgr_client` — published to **GitHub Packages** (`.npmrc`
sets `@sudobility:registry=https://npm.pkg.github.com`), not the public npm registry.
CI publishes via `johnqh/workflows` with `publish-target: github`.

## Tech Stack

- TypeScript, **very strict** (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, …)
- Runtime / package manager: **Bun** (do not use npm/yarn/pnpm)
- Build: `tsc`, ESM-only output (`"type": "module"`, `moduleResolution: NodeNext`)
- Test: **Vitest**
- Peers: React 18/19, `@tanstack/react-query` 5, `@sudobility/types`, `@sudobility/svgr_types`

## Commands

```bash
bun run build        # compile to dist/ (tsc)
bun run dev          # tsc --watch
bun run test:unit    # run tests (Vitest)   <-- NOT `bun test`
bun run lint         # ESLint
bun run typecheck    # tsc --noEmit
bun run verify       # typecheck + lint + test:unit + build (run before publishing)
```

There is **no `test` script**. `bun test` invokes Bun's native runner, which is not
what these Vitest suites expect — always use `bun run test:unit`.

## Project Structure

```
src/
├── index.ts                     # Public exports (+ type re-exports from svgr_types)
├── network/
│   ├── SvgrClient.ts            # HTTP client class: all endpoints, retry, live-job WS
│   └── SvgrClient.test.ts
└── hooks/
    ├── index.ts                 # Hook exports
    ├── query-keys.ts            # svgrKeys query-key factory
    ├── query-keys.test.ts
    ├── useConvert.ts            # convert mutation
    ├── useUploadImage.ts        # upload mutation
    ├── useCreateJob.ts          # create-job mutation
    ├── useCancelJob.ts          # cancel-job mutation (writes result into status cache)
    ├── useJobStatus.ts          # job status query: live WS + polling fallback
    ├── useImageJobs.ts          # jobs-for-image query
    ├── useUserImages.ts         # user's images query
    └── useCommunities.ts        # communities query (24h staleTime)
```

## Architecture

`SvgrClient` is a thin typed wrapper over a `NetworkClient` (from `@sudobility/types`,
injected via config) that owns auth headers and serialization. Every method returns a
`BaseResponse<T>` and throws `SvgrApiError` (carries HTTP `status`) on failure. Hooks are
small TanStack Query wrappers that take a client instance as their first argument.

Dependency chain: `@sudobility/types` (NetworkClient) → `svgr_types` (contract types) →
`svgr_client` (this) → `svgr_lib`, `svgr_app`, `svgr_app_rn`.

### Endpoints (all on `SvgrClient`)

`convert` `POST /api/v1/convert`, `fetchSvg` `GET /api/v1/svg/:id`, `uploadImage`
`POST /api/v1/images/upload`, `createJob` `POST /api/v1/jobs`, `getJobStatus`
`GET /api/v1/jobs/:id`, `cancelJob` `POST /api/v1/jobs/:id/cancel`, `subscribeJob`
`WS /api/v1/jobs/:id/live`, `getJobsForImage` `GET /api/v1/jobs?imageId=`,
`getUserImages` `GET /api/v1/images`, `getCommunities` `GET /api/v1/communities?lang=`,
`fetchFile` `GET /api/v1/files/:name`.

## Key Conventions

- `SvgrClientConfig` = `{ baseUrl, networkClient, retry?, getAuthToken? }`.
- `convert()` takes **individual positional params**, not a request object:
  `convert(original, filename?, quality?, transparentBg?, ocr?, mergePaths?, smooth?, imageType?)`.
  quality is 1–10 (default 5). `useConvert` accepts the same fields as a `ConvertMutationParams` object.
- `RetryConfig` = `{ maxRetries, baseDelayMs, retryableStatuses? }`; exponential backoff
  `baseDelayMs * 2^attempt`; default retryable statuses `[408, 429, 500, 502, 503, 504]`.
  Non-retryable codes (400/401/403) fail immediately. Retry is opt-in via `config.retry`.
- Query keys come from the `svgrKeys` factory — do not hand-build cache keys.
- Tests use `MockNetworkClient` from `@sudobility/di/mocks`.

## Gotchas

- **Auth is the `NetworkClient`'s job, not this package's.** No `getToken` pattern; the
  client never sets auth headers itself (except the live-job WS below).
- **Live job WebSocket authenticates in-band.** A WS can't send an `Authorization` header,
  so `subscribeJob` sends the token (from `getAuthToken`) as its first message. It is a
  **no-op** when `WebSocket` is undefined or no `getAuthToken` was configured — callers then
  rely on `useJobStatus` polling (2.5s, stops at terminal status `done`/`error`/`cancelled`).
- **`fetchSvg` uses native `fetch`**, bypassing the `NetworkClient`, because the response is
  raw SVG text, not JSON. `fetchFile` goes through the `NetworkClient` and returns a `Blob`.
- **`uploadImage` is cross-platform.** On React Native a `Blob` cannot be built from an
  `ArrayBuffer`, so it routes bytes through a `data:` URL + `fetch` (`bufferToBlob`).
- **Catch `SvgrApiError`** (not generic `Error`) to read the HTTP `status`.
- **`moduleResolution: NodeNext`**, not bundler — bundler resolution emitted extensionless
  specifiers that made consumers resolve every export as `any`. Keep relative imports with
  `.js` extensions.
- **`exactOptionalPropertyTypes`** is on: you cannot assign `undefined` to an optional field
  unless the type explicitly includes `undefined`.
- **`removeComments: true`** strips JSDoc from `.js` output but keeps it in `.d.ts`.
- No `dependencies` field — everything is a peer or dev dependency; consumers provide peers.

## Related Projects

Siblings under `/Users/qianghuang/projects/`: `svgr_types` (contract types this imports),
`svgr_api` (backend), `svgr_lib` (consumes this), `svgr_app`, `svgr_app_rn`, `svgr_ai`.
