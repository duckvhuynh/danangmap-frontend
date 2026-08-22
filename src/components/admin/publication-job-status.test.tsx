import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PublicationJob } from "@/lib/api/publication-jobs";
import { PublicationJobStatus } from "./publication-job-status";

function job(overrides: Partial<PublicationJob> = {}): PublicationJob {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    layerId: "22222222-2222-4222-8222-222222222222",
    revisionId: "33333333-3333-4333-8333-333333333333",
    status: "queued",
    phase: "queued",
    progress: { completedUnits: 0, totalUnits: null, unit: "features", percent: null },
    attempt: 0,
    result: null,
    failure: null,
    createdAt: "2026-08-22T01:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    updatedAt: "2026-08-22T01:00:00.000Z",
    ...overrides,
  };
}

afterEach(cleanup);

describe("publication job status", () => {
  it("keeps queued and unknown-total work indeterminate", () => {
    render(<PublicationJobStatus job={job()}/>);
    expect(screen.getAllByText("Đang chờ xử lý")).toHaveLength(2);
    expect(screen.getByText("0 đối tượng đã xử lý. Tổng số đang được đo.")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("keeps queued work indeterminate even if a defensive representation includes a total", () => {
    render(<PublicationJobStatus job={job({
      progress: { completedUnits: 0, totalUnits: 20, unit: "features", percent: 0 },
    })}/>);
    expect(screen.getByText("0 trên 20 đối tượng, 0%.")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("renders a determinate zero percent without treating zero as missing", () => {
    render(<PublicationJobStatus job={job({
      status: "building",
      phase: "scanning_features",
      progress: { completedUnits: 0, totalUnits: 20, unit: "features", percent: 0 },
    })}/>);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("0 trên 20 đối tượng, 0%.")).toBeInTheDocument();
  });

  it("labels an empty revision explicitly", () => {
    render(<PublicationJobStatus job={job({
      status: "building",
      phase: "switching",
      progress: { completedUnits: 0, totalUnits: 0, unit: "features", percent: null },
    })}/>);
    expect(screen.getByText("Revision không có đối tượng cần dựng.")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("100%", { exact: false })).not.toBeInTheDocument();
  });

  it("keeps the last measured value while switching instead of inventing 99 or 100 percent", () => {
    render(<PublicationJobStatus job={job({
      status: "building",
      phase: "switching",
      progress: { completedUnits: 9, totalUnits: 20, unit: "features", percent: 45 },
    })}/>);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "45");
    expect(screen.queryByText(/99%|100%/u)).not.toBeInTheDocument();
    expect(screen.getByText(/vẫn dùng publication hiện hành/u)).toBeInTheDocument();
  });

  it("renders only the redacted failure contract", () => {
    const failed = {
      ...job({
        status: "failed",
        phase: "failed",
        progress: { completedUnits: 7, totalUnits: 20, unit: "features", percent: 35 },
        failure: { code: "PUBLICATION_BUILD_FAILED", userMessage: "Không thể dựng dữ liệu công khai.", requestId: "44444444-4444-4444-8444-444444444444", retryable: true },
        finishedAt: "2026-08-22T01:01:00.000Z",
        updatedAt: "2026-08-22T01:01:00.000Z",
      }),
      details: { sql: "select private_key from attachments", stack: "secret-stack" },
    } as PublicationJob;
    render(<PublicationJobStatus job={failed}/>);
    expect(screen.getByRole("alert")).toHaveTextContent("Không thể dựng dữ liệu công khai.");
    expect(screen.getByText(/PUBLICATION_BUILD_FAILED/u)).toBeInTheDocument();
    expect(screen.getByText(/44444444/u)).toBeInTheDocument();
    expect(screen.queryByText(/private_key|secret-stack|select/u)).not.toBeInTheDocument();
  });

  it("describes a disconnected tracker without marking the server job failed", () => {
    render(<PublicationJobStatus job={job()} trackingState="disconnected"/>);
    expect(screen.getByRole("status")).toHaveTextContent("Công việc trên máy chủ vẫn tiếp tục");
    expect(screen.queryByText("Công bố không thành công")).not.toBeInTheDocument();
  });

  it("renders a safe tracking contract issue while preserving the last confirmed job", () => {
    render(<PublicationJobStatus
      job={job()}
      trackingState="disconnected"
      trackingIssue={{
        code: "PUBLICATION_JOB_REPRESENTATION_REJECTED",
        userMessage: "Máy chủ trả trạng thái publication job không nối tiếp trạng thái đã xác nhận.",
      }}
    />);
    expect(screen.getByRole("status")).toHaveTextContent("không nối tiếp trạng thái đã xác nhận");
    expect(screen.getByRole("status")).toHaveTextContent("PUBLICATION_JOB_REPRESENTATION_REJECTED");
    expect(screen.getByText("0 đối tượng đã xử lý. Tổng số đang được đo.")).toBeInTheDocument();
  });

  it("does not put percentage changes in the polite live announcement", () => {
    const view = render(<PublicationJobStatus job={job({
      status: "building",
      phase: "scanning_features",
      progress: { completedUnits: 2, totalUnits: 10, unit: "features", percent: 20 },
    })}/>);
    const liveRegion = screen.getByText("Đang dựng dữ liệu công khai", { selector: ".sr-only" });
    expect(liveRegion).not.toHaveTextContent("20");

    view.rerender(<PublicationJobStatus job={job({
      status: "building",
      phase: "scanning_features",
      progress: { completedUnits: 7, totalUnits: 10, unit: "features", percent: 70 },
    })}/>);
    expect(liveRegion).toHaveTextContent("Đang dựng dữ liệu công khai");
    expect(liveRegion).not.toHaveTextContent("70");
  });

  it("does not mount a polite live region for a static compact history card", () => {
    const compactJob = job();
    const { container } = render(<PublicationJobStatus job={compactJob} compact/>);
    expect(container.querySelector("[aria-live]")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: `Publication job ${compactJob.id}` })).toHaveTextContent("Đang chờ xử lý");
  });
});
