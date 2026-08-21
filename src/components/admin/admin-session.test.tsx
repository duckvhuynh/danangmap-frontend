import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminErrorNotice } from "./admin-session";
import { AdminApiError } from "@/lib/api/admin";

afterEach(cleanup);

describe("admin trust-state feedback", () => {
  it.each([
    [401, "Phiên đăng nhập đã hết hạn"],
    [403, "không có quyền"],
    [409, "Trạng thái revision đã thay đổi"],
    [412, "Dữ liệu trên máy chủ mới hơn"],
    [422, "Dữ liệu chưa hợp lệ"],
  ])("renders an explicit %i response", (status, expected) => {
    render(<AdminErrorNotice error={new AdminApiError(status, `HTTP_${status}`, "Chi tiết API", `request-${status}`)}/>);
    expect(screen.getByRole("alert")).toHaveTextContent(expected);
    expect(screen.getByRole("alert")).toHaveTextContent(`request-${status}`);
  });

  it("retains structured conflict details for recovery decisions", () => {
    render(<AdminErrorNotice error={new AdminApiError(409, "PUBLICATION_BASE_STALE", "Publication base stale.", "request-stale", { baseRevisionId: "base-revision", activeRevisionId: "active-revision" })}/>);
    fireEvent.click(screen.getByText("Chi tiết từ máy chủ"));
    expect(screen.getByRole("alert")).toHaveTextContent("base-revision");
    expect(screen.getByRole("alert")).toHaveTextContent("active-revision");
  });
});
