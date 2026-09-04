import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { RevisionHistory } from "@/lib/api/history";

export function ValidationReport({ validation }: { validation: RevisionHistory["validation"] }) {
  if (validation.status === "valid") {
    return <Alert>
      <IconCircleCheck stroke={1.75}/>
      <AlertTitle>Dữ liệu hợp lệ</AlertTitle>
      <AlertDescription>{validation.featureCount.toLocaleString("vi-VN")} đối tượng đã được kiểm tra trong phiên bản này.</AlertDescription>
    </Alert>;
  }

  return <Alert variant="destructive">
    <IconAlertTriangle stroke={1.75}/>
    <AlertTitle>Cần xử lý lỗi dữ liệu</AlertTitle>
    <AlertDescription>
      <p>{validation.featureCount.toLocaleString("vi-VN")} đối tượng đã được kiểm tra. Cần sửa các lỗi bên dưới trước khi tiếp tục.</p>
      <ul className="mt-3 flex flex-col gap-2" aria-label="Các nhóm lỗi dữ liệu">
        {validation.issues.map((issue) => <li key={issue.code} className="flex flex-wrap items-center justify-between gap-2">
          <span>{issue.code === "GEOMETRY_INVALID" ? "Vị trí hoặc hình dạng không hợp lệ" : issue.code === "REQUIRED_PROPERTY_MISSING" ? "Thiếu thông tin bắt buộc" : "Dữ liệu cần được kiểm tra lại"}</span>
          <Badge>{issue.count.toLocaleString("vi-VN")}</Badge>
        </li>)}
      </ul>
    </AlertDescription>
  </Alert>;
}
