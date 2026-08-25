import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeaturePropertiesEditor } from "./feature-properties-editor";
import type { AdminField } from "@/lib/api/admin";

const fields: AdminField[] = [
  {
    key: "population",
    label: "Dân số",
    description: "Số người theo thống kê gần nhất",
    type: "integer",
    icon: "number",
    required: true,
    public: true,
    searchable: true,
    filterable: true,
    sortable: true,
    sensitive: false,
    offlineCache: true,
    validation: { minimum: 0, maximum: 1_000_000 },
    options: [],
    displayOrder: 0,
  },
];

describe("FeaturePropertiesEditor", () => {
  it("renders schema visibility metadata and commits a coerced value", () => {
    const onPatch = vi.fn();
    render(
      <FeaturePropertiesEditor
        featureId="feature-1"
        properties={{ population: 1200 }}
        fields={fields}
        onPatch={onPatch}
      />,
    );
    expect(screen.getByText("Công khai")).toBeInTheDocument();
    expect(screen.getByText(/Tìm kiếm/u)).toBeInTheDocument();
    expect(screen.getByText(/Bộ lọc/u)).toBeInTheDocument();
    const input = screen.getByRole("spinbutton", { name: /Dân số/u });
    fireEvent.change(input, { target: { value: "2500" } });
    fireEvent.blur(input);
    expect(onPatch).toHaveBeenCalledWith({ population: 2500 });
  });

  it("shows a clear empty state until an object is selected", () => {
    render(
      <FeaturePropertiesEditor
        featureId={null}
        properties={null}
        fields={fields}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.getByText(/Chọn một đối tượng/u)).toBeInTheDocument();
  });
});
