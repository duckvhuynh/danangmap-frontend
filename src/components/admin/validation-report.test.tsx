import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ValidationReport } from "./validation-report";

describe("ValidationReport language", () => {
  it("explains geometry and missing-property errors without exposing protocol codes", () => {
    render(<ValidationReport validation={{ status: "invalid", featureCount: 5, issues: [{ code: "GEOMETRY_INVALID", count: 1 }, { code: "REQUIRED_PROPERTY_MISSING", count: 2 }] }} />);
    expect(screen.getByText("Vị trí hoặc hình dạng không hợp lệ")).toBeInTheDocument();
    expect(screen.getByText("Thiếu thông tin bắt buộc")).toBeInTheDocument();
    expect(screen.queryByText("GEOMETRY_INVALID")).not.toBeInTheDocument();
  });
});
