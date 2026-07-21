import { CheckCircle, Clock, Warning, XCircle } from "@phosphor-icons/react";
import { Badge } from "./ui/badge";

const statusConfig = {
  Active: { tone: "success" as const, icon: CheckCircle },
  Ready: { tone: "info" as const, icon: CheckCircle },
  Draft: { tone: "neutral" as const, icon: Clock },
  "Needs attention": { tone: "danger" as const, icon: Warning },
  Succeeded: { tone: "success" as const, icon: CheckCircle },
  Attention: { tone: "warning" as const, icon: Warning },
  Healthy: { tone: "success" as const, icon: CheckCircle },
  Low: { tone: "warning" as const, icon: Warning },
  Out: { tone: "danger" as const, icon: XCircle },
};

export function StatusBadge({ status }: { status: keyof typeof statusConfig }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <Badge tone={config.tone}>
      <Icon size={12} weight="fill" aria-hidden="true" />
      {status}
    </Badge>
  );
}
