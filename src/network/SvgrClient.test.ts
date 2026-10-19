import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MockNetworkClient } from "@sudobility/di/mocks";
import { SvgrClient, SvgrApiError } from "./SvgrClient.js";
import type { RetryConfig } from "./SvgrClient.js";

describe("SvgrClient", () => {
  let client: SvgrClient;
  let mockNetwork: MockNetworkClient;

  beforeEach(() => {
    mockNetwork = new MockNetworkClient();
    client = new SvgrClient({
      baseUrl: "http://localhost:3001",
      networkClient: mockNetwork,
    });
  });

  it("sends POST request to /api/v1/convert", async () => {
    const mockResponse = {
      success: true,
      data: { cacheId: "test-cache-id", width: 100, height: 100 },
    };

    mockNetwork.setMockResponse(
      "http://localhost:3001/api/v1/convert",
      { data: mockResponse, ok: true },
      "POST",
    );

    const result = await client.convert("base64data", "test.png");
    expect(result).toEqual(mockResponse);
    expect(
      mockNetwork.wasUrlCalled("http://localhost:3001/api/v1/convert", "POST"),
    ).toBe(true);
  });

  it("includes all parameters in request body", async () => {
    mockNetwork.setMockResponse(
      "http://localhost:3001/api/v1/convert",
      { data: { success: true }, ok: true },
      "POST",
    );

    await client.convert("data", "photo.png", 90, true);

    const lastRequest = mockNetwork.getLastRequest();
    expect(lastRequest?.body).toBe(
      JSON.stringify({
        original: "data",
        filename: "photo.png",
        quality: 90,
        transparentBg: true,
      }),
    );
  });

  it("throws SvgrApiError on non-ok response", async () => {
    mockNetwork.setMockResponse(
      "http://localhost:3001/api/v1/convert",
      { data: { error: "Bad request" }, ok: false, status: 400 },
      "POST",
    );

    await expect(client.convert("bad")).rejects.toThrow(SvgrApiError);
    await expect(client.convert("bad")).rejects.toThrow("Bad request");
  });

  it("throws SvgrApiError with default message when no error field", async () => {
    mockNetwork.setMockResponse(
      "http://localhost:3001/api/v1/convert",
      { data: null, ok: false, status: 500 },
      "POST",
    );

    await expect(client.convert("bad")).rejects.toThrow("Conversion failed");
  });
});

describe("SvgrClient with retry", () => {
  let mockNetwork: MockNetworkClient;
  const retryConfig: RetryConfig = {
    maxRetries: 2,
    baseDelayMs: 1, // Minimal delay for fast tests
  };

  beforeEach(() => {
    mockNetwork = new MockNetworkClient();
  });

  it("succeeds without retry when first request succeeds", async () => {
    const client = new SvgrClient({
      baseUrl: "http://localhost:3001",
      networkClient: mockNetwork,
      retry: retryConfig,
    });

    const mockResponse = {
      success: true,
      data: { cacheId: "test-cache-id", width: 100, height: 100 },
    };

    mockNetwork.setMockResponse(
      "http://localhost:3001/api/v1/convert",
      { data: mockResponse, ok: true },
      "POST",
    );

    const result = await client.convert("base64data");
    expect(result).toEqual(mockResponse);
  });

  it("does not retry on non-retryable status codes (e.g. 400)", async () => {
    const client = new SvgrClient({
      baseUrl: "http://localhost:3001",
      networkClient: mockNetwork,
      retry: retryConfig,
    });

    mockNetwork.setMockResponse(
      "http://localhost:3001/api/v1/convert",
      { data: { error: "Bad request" }, ok: false, status: 400 },
      "POST",
    );

    await expect(client.convert("bad")).rejects.toThrow(SvgrApiError);
    await expect(client.convert("bad")).rejects.toThrow("Bad request");
  });

  it("respects custom retryableStatuses", async () => {
    const client = new SvgrClient({
      baseUrl: "http://localhost:3001",
      networkClient: mockNetwork,
      retry: {
        maxRetries: 1,
        baseDelayMs: 1,
        retryableStatuses: [418],
      },
    });

    // 418 I'm a teapot - custom retryable status
    mockNetwork.setMockResponse(
      "http://localhost:3001/api/v1/convert",
      { data: { error: "I am a teapot" }, ok: false, status: 418 },
      "POST",
    );

    // Should retry on 418 and then fail (since mock always returns 418)
    await expect(client.convert("teapot")).rejects.toThrow(SvgrApiError);
  });

  it("works without retry config (default behavior)", async () => {
    const client = new SvgrClient({
      baseUrl: "http://localhost:3001",
      networkClient: mockNetwork,
    });

    mockNetwork.setMockResponse(
      "http://localhost:3001/api/v1/convert",
      { data: null, ok: false, status: 500 },
      "POST",
    );

    await expect(client.convert("bad")).rejects.toThrow("Conversion failed");
  });
});

describe("SvgrClient job methods", () => {
  let mockNetwork: MockNetworkClient;
  let client: SvgrClient;

  beforeEach(() => {
    mockNetwork = new MockNetworkClient();
    client = new SvgrClient({
      baseUrl: "http://localhost:3001",
      networkClient: mockNetwork,
    });
  });

  it("createJob sends POST to /api/v1/jobs", async () => {
    const mockResponse = {
      success: true,
      data: {
        jobId: "j1",
        imageId: "i1",
        status: "pending",
        quality: 5,
        transparentBg: false,
        ocr: true,
        mergePaths: true,
        smooth: 0,
        imageType: "auto",
        apiVersion: "1.0.52",
        createdAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };
    mockNetwork.setMockResponse(
      "http://localhost:3001/api/v1/jobs",
      { data: mockResponse, ok: true },
      "POST",
    );

    const result = await client.createJob({ imageId: "i1", quality: 7 });
    expect(result.success).toBe(true);
    expect(
      mockNetwork.wasUrlCalled("http://localhost:3001/api/v1/jobs", "POST"),
    ).toBe(true);
  });

  it("getJobStatus sends GET to /api/v1/jobs/:id", async () => {
    const mockResponse = {
      success: true,
      data: {
        jobId: "j1",
        imageId: "i1",
        status: "done",
        quality: 5,
        transparentBg: false,
        ocr: true,
        mergePaths: true,
        smooth: 0,
        imageType: "auto",
        apiVersion: "1.0.52",
        createdAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };
    mockNetwork.setMockResponse(
      "http://localhost:3001/api/v1/jobs/j1",
      { data: mockResponse, ok: true },
      "GET",
    );

    const result = await client.getJobStatus("j1");
    expect(result.success).toBe(true);
    expect(
      mockNetwork.wasUrlCalled("http://localhost:3001/api/v1/jobs/j1", "GET"),
    ).toBe(true);
  });

  it("getJobsForImage sends GET with imageId query", async () => {
    const mockResponse = {
      success: true,
      data: [],
      timestamp: new Date().toISOString(),
    };
    mockNetwork.setMockResponse(
      "http://localhost:3001/api/v1/jobs?imageId=i1",
      { data: mockResponse, ok: true },
      "GET",
    );

    const result = await client.getJobsForImage("i1");
    expect(result.success).toBe(true);
    expect(
      mockNetwork.wasUrlCalled(
        "http://localhost:3001/api/v1/jobs?imageId=i1",
        "GET",
      ),
    ).toBe(true);
  });

  it("POSTs to /jobs/:id/cancel and returns the cancelled job", async () => {
    const mockResponse = {
      success: true,
      data: { jobId: "j1", status: "cancelled" },
    };
    mockNetwork.setMockResponse(
      "http://localhost:3001/api/v1/jobs/j1/cancel",
      { data: mockResponse, ok: true },
      "POST",
    );

    const result = await client.cancelJob("j1");
    expect(result.data?.status).toBe("cancelled");
    expect(
      mockNetwork.wasUrlCalled(
        "http://localhost:3001/api/v1/jobs/j1/cancel",
        "POST",
      ),
    ).toBe(true);
  });

  it("throws SvgrApiError when cancel fails", async () => {
    mockNetwork.setMockResponse(
      "http://localhost:3001/api/v1/jobs/j1/cancel",
      { data: { error: "Job not found" }, ok: false, status: 404 },
      "POST",
    );
    await expect(client.cancelJob("j1")).rejects.toThrow("Job not found");
  });

  it("subscribeJob is a safe no-op without getAuthToken", () => {
    // No getAuthToken configured, so there is nothing to authenticate the
    // socket with: subscribe must not throw and its unsubscribe must be safe.
    const unsubscribe = client.subscribeJob("j1", { onJob: () => {} });
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe("SvgrApiError", () => {
  it("includes status code", () => {
    const error = new SvgrApiError(404, "Not found");
    expect(error.status).toBe(404);
    expect(error.message).toBe("Not found");
    expect(error.name).toBe("SvgrApiError");
  });

  it("is an instance of Error", () => {
    const error = new SvgrApiError(500, "Internal error");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SvgrApiError);
  });
});
