import { AuroraCard } from "@stenvault/shared/ui/aurora-card";
import {
  Activity,
  Cloud,
  Database,
  HardDrive,
  Mail,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { StaggerContainer, StaggerItem } from "@stenvault/shared/ui/animated";
import { cn } from "@stenvault/shared/utils";
import { useTheme } from "@/contexts/ThemeContext";

interface SystemSettingsProps {
  health?: {
    status?: string;
    services: {
      database?: boolean;
      redis?: boolean | null;
      r2Storage?: boolean | null;
      email?: boolean;
    };
  };
}

export function SystemSettings({ health }: SystemSettingsProps) {
  return (
    <AuroraCard variant="default">
      <div className="mb-4">
        <h3 className="flex items-center gap-2 font-display text-lg text-foreground">
          <Activity className="w-5 h-5 text-primary" />
          System Health
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">Service connectivity status</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ServiceStatus
          icon={<Database className="w-5 h-5" />}
          name="Database"
          status={health?.services.database}
        />
        <ServiceStatus
          icon={<Cloud className="w-5 h-5" />}
          name="Redis Cache"
          status={health?.services.redis}
        />
        <ServiceStatus
          icon={<HardDrive className="w-5 h-5" />}
          name="R2 Storage"
          status={health?.services.r2Storage}
        />
        <ServiceStatus
          icon={<Mail className="w-5 h-5" />}
          name="Email Service"
          status={health?.services.email}
        />
      </div>
    </AuroraCard>
  );
}

function ServiceStatus({ icon, name, status }: { icon: React.ReactNode; name: string; status?: boolean | null }) {
  const { theme } = useTheme();

  // null = not configured, undefined = loading, true = healthy, false = unhealthy
  const isHealthy = status === true;
  const isNotConfigured = status === null;

  return (
    <div
      className={cn(
        "flex items-center justify-between p-4 rounded-lg",
        "border bg-card/50",
        "transition-colors duration-200"
      )}
      style={{
        borderColor: isHealthy ? `${theme.semantic.success}30` : status === false ? `${theme.semantic.error}30` : 'var(--border)',
        backgroundColor: isHealthy ? `${theme.semantic.success}05` : status === false ? `${theme.semantic.error}05` : undefined
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="p-2 rounded-lg"
          style={{
            backgroundColor: isHealthy ? `${theme.semantic.success}15` : status === false ? `${theme.semantic.error}15` : undefined,
            color: isHealthy ? theme.semantic.success : status === false ? theme.semantic.error : 'var(--muted-foreground)'
          }}
        >
          {icon}
        </div>
        <div>
          <span className="font-medium text-foreground">{name}</span>
          {isNotConfigured && <span className="text-xs text-muted-foreground ml-2">(not configured)</span>}
        </div>
      </div>
      {isHealthy ? (
        <CheckCircle2 className="w-5 h-5" style={{ color: theme.semantic.success }} />
      ) : status === false ? (
        <XCircle className="w-5 h-5" style={{ color: theme.semantic.error }} />
      ) : (
        <XCircle className="w-5 h-5 text-muted-foreground" />
      )}
    </div>
  );
}
