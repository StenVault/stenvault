/**
 * Admin - Send Abuse Management Hooks
 * Queries and mutations for the Send abuse tab.
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function useSendAbuseQueries() {
  const reports = trpc.admin.listSendAbuseReports.useQuery(
    { limit: 20, offset: 0 },
    { refetchInterval: 30000 },
  );

  const analytics = trpc.admin.getSendAnalytics.useQuery(
    { days: 7 },
    { refetchInterval: 60000 },
  );

  const blockedIps = trpc.admin.listBlockedSendIps.useQuery(
    { limit: 50 },
    { refetchInterval: 60000 },
  );

  return { reports, analytics, blockedIps };
}

export function useSendAbuseMutations(callbacks?: {
  onSuccess?: () => void;
}) {
  const utils = trpc.useUtils();

  const invalidateAll = () => {
    utils.admin.listSendAbuseReports.invalidate();
    utils.admin.listBlockedSendIps.invalidate();
    utils.admin.getSendAnalytics.invalidate();
    callbacks?.onSuccess?.();
  };

  const dismissMutation = trpc.admin.dismissSendAbuseReport.useMutation({
    onSuccess: () => {
      toast.success("Abuse report dismissed");
      invalidateAll();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.admin.deleteSendSession.useMutation({
    onSuccess: () => {
      toast.success("Send session deleted");
      invalidateAll();
    },
    onError: (err) => toast.error(err.message),
  });

  const banMutation = trpc.admin.banSendIp.useMutation({
    onSuccess: () => {
      toast.success("IP address banned");
      invalidateAll();
    },
    onError: (err) => toast.error(err.message),
  });

  const unbanMutation = trpc.admin.unbanSendIp.useMutation({
    onSuccess: () => {
      toast.success("IP address unbanned");
      invalidateAll();
    },
    onError: (err) => toast.error(err.message),
  });

  return { dismissMutation, deleteMutation, banMutation, unbanMutation };
}
