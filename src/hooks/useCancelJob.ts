import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BaseResponse, JobResult } from "@sudobility/svgr_types";
import type { SvgrClient } from "../network/SvgrClient.js";
import { svgrKeys } from "./query-keys.js";

/**
 * Cancel a pending or running job. On success the returned (cancelled) job is
 * written into the job-status cache so watchers update immediately, without
 * waiting for the next poll or socket push.
 */
export function useCancelJob(client: SvgrClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => client.cancelJob(jobId),
    onSuccess: (response) => {
      const job = response.data;
      if (job) {
        queryClient.setQueryData<BaseResponse<JobResult>>(
          svgrKeys.job(job.jobId),
          response,
        );
      }
    },
  });
}
