import { Badge } from "@/components/ui/badge";
import type { SubmissionStatus } from "@/types";

interface StatusConfig {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "processing";
}

const STATUS_CONFIG: Record<SubmissionStatus, StatusConfig> = {
  uploaded:   { label: "Uploaded",   variant: "secondary"  },
  queued:     { label: "Queued",     variant: "outline"    },
  processing: { label: "Processing", variant: "processing" },
  completed:  { label: "Completed",  variant: "success"    },
  failed:     { label: "Failed",     variant: "destructive"},
};

interface StatusBadgeProps {
  status: SubmissionStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, variant } = STATUS_CONFIG[status] ?? STATUS_CONFIG.uploaded;
  return <Badge variant={variant}>{label}</Badge>;
}
