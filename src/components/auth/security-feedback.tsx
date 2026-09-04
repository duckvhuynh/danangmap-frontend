import {
  CircleAlert as IconAlertCircle,
  Check as IconCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function SecurityError({
  message,
  errorRef,
  id,
  title = "Không thể hoàn tất yêu cầu",
}: {
  message: string;
  errorRef: React.RefObject<HTMLDivElement | null>;
  id?: string;
  title?: string;
}) {
  return (
    <Alert
      className="border-destructive/25 bg-red-50 text-destructive"
      id={id}
      ref={errorRef}
      tabIndex={-1}
      variant="destructive"
    >
      <IconAlertCircle size={18} strokeWidth={1.75} />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function SecuritySuccess({ title, description }: { title: string; description: string }) {
  return (
    <Alert className="border-success/30 bg-surface-subtle text-success" role="status">
      <IconCheck size={18} strokeWidth={1.75} />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
