import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { RevisionHistory } from "@/lib/api/history";

export function ValidationReport({ validation }: { validation: RevisionHistory["validation"] }) {
  if (validation.status === "valid") {
    return <Alert>
      <IconCircleCheck stroke={1.75}/>
      <AlertTitle>Dữ liệu hợp lệ</AlertTitle>
      <AlertDescription>{validation.featureCount.toLocaleString("vi-VN")} đối tượng đã qua kiểm tra ở revision này.</AlertDescription>
    </Alert>;
  }

  return <Alert variant="destructive">
    <IconAlertTriangle stroke={1.75}/>
    <AlertTitle>Cần xử lý lỗi dữ liệu</AlertTitle>
    <AlertDescription>
      <p>{validation.featureCount.toLocaleString("vi-VN")} đối tượng đã được kiểm tra. Revision chưa đủ điều kiện cho bước tiếp theo.</p>
      <ul className="mt-3 flex flex-col gap-2" aria-label="Các nhóm lỗi validation">
        {validation.issues.map((issue) => <li key={issue.code} className="flex flex-wrap items-center justify-between gap-2">
          <span>{issue.code}</span>
          <Badge>{issue.count.toLocaleString("vi-VN")}</Badge>
        </li>)}
      </ul>
    </AlertDescription>
  </Alert>;
}
