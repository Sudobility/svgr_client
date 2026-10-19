import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BaseResponse, JobResult } from "@sudobility/svgr_types";
import type { SvgrClient } from "../network/SvgrClient.js";
import { svgrKeys } from "./query-keys.js";

const TERMINAL: ReadonlySet<JobResult["status"]> = new Set([
  "done",
  "error",
  "cancelled",
]);

/**
 * Track one job's status.
 *
 * A live WebSocket pushes each status change straight into the query cache, so
 * updates are near-instant. Polling stays on as a safety net (and for
 * environments where the socket can't connect), backing off to nothing once a
 * terminal status is reached.
 */
export function useJobStatus(client: SvgrClient, jobId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: svgrKeys.job(jobId ?? ""),
    queryFn: () => client.getJobStatus(jobId ?? ""),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      if (status && TERMINAL.has(status)) return false;
      return 2500;
    },
  });

  useEffect(() => {
    if (!jobId) return;
    const unsubscribe = client.subscribeJob(jobId, {
      onJob: (job) => {
        queryClient.setQueryData<BaseResponse<JobResult>>(svgrKeys.job(jobId), {
          success: true,
          data: job,
        } as BaseResponse<JobResult>);
      },
    });
    return unsubscribe;
  }, [client, jobId, queryClient]);

  return query;
}
