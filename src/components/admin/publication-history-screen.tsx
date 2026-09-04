"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeft as IconArrowLeft,
  Clock as IconClock,
  Database as IconDatabase,
  History as IconHistory,
  RefreshCw as IconRefresh,
  Shield as IconShieldLock,
} from "lucide-react";
import {
  AdminErrorNotice,
  useAdminSession,
} from "@/components/admin/admin-session";
import { AuditEventList } from "@/components/admin/audit-event-list";
import {
  historyDate,
  historyStatusLabel,
} from "@/components/admin/history-format";
import { PublicationJobStatus } from "@/components/admin/publication-job-status";
import { RollbackDialog } from "@/components/admin/rollback-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getDesktopAuthoringCapability,
  getServerDesktopAuthoringCapability,
  subscribeDesktopAuthoringCapability,
} from "@/lib/admin/authoring-capability";
import { canPublishContent } from "@/lib/admin/role-capabilities";
import {
  listLayerAuditEvents,
  listLayerPublicationHistory,
  listLayerRevisionHistory,
  rollbackLayer,
  type AuditEvents,
  type HistoryResource,
  type LayerPublicationHistory,
  type LayerRevisionHistory,
  type PublicationHistoryResource,
  type RollbackResult,
} from "@/lib/api/history";
import {
  listLayerPublicationJobs,
  type PublicationJobListResource,
} from "@/lib/api/publication-jobs";

export interface PublicationHistoryTransport {
  revisions: typeof listLayerRevisionHistory;
  publications: typeof listLayerPublicationHistory;
  jobs: typeof listLayerPublicationJobs;
  audit: typeof listLayerAuditEvents;
  rollback: typeof rollbackLayer;
}

const defaultTransport: PublicationHistoryTransport = {
  revisions: listLayerRevisionHistory,
  publications: listLayerPublicationHistory,
  jobs: listLayerPublicationJobs,
  audit: listLayerAuditEvents,
  rollback: rollbackLayer,
};

function ScreenSkeleton() {
  return (
    <main
      className="mx-auto max-w-6xl p-4 pb-24 sm:p-6 md:p-8"
      aria-busy="true"
    >
      <p className="sr-only" role="status" aria-live="polite">
        Đang tải lịch sử lớp dữ liệu.
      </p>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <div className="mt-8 flex flex-col gap-5">
        <Skeleton className="h-72 w-full rounded-panel" />
        <Skeleton className="h-64 w-full rounded-panel" />
        <Skeleton className="h-64 w-full rounded-panel" />
      </div>
    </main>
  );
}

function progressText(publication: LayerPublicationHistory["items"][number]) {
  if (publication.progress === null) return "Chưa có số đo";
  return `${publication.progress}%`;
}

function eligibilityText(
  reason: LayerPublicationHistory["items"][number]["rollbackEligibility"]["reasonCode"],
) {
  if (reason === "ROLE_FORBIDDEN")
    return "Bạn không có quyền khôi phục bản công bố.";
  if (reason === "ROLLBACK_TARGET_ACTIVE")
    return "Bản này đang hiển thị trên bản đồ.";
  if (reason === "SEPARATION_OF_DUTIES")
    return "Bản này cần một người công bố khác thực hiện khôi phục.";
  if (reason === "ROLLBACK_TARGET_INVALID")
    return "Bản này chưa được công bố thành công nên không thể khôi phục.";
  return "Không thể khôi phục bản công bố này.";
}

export function PublicationHistoryScreen({
  layerId,
  transport = defaultTransport,
}: {
  layerId: string;
  transport?: PublicationHistoryTransport;
}) {
  const { principal, csrfToken } = useAdminSession();
  const desktopCapable = useSyncExternalStore(
    subscribeDesktopAuthoringCapability,
    getDesktopAuthoringCapability,
    getServerDesktopAuthoringCapability,
  );
  const [revisions, setRevisions] =
    useState<HistoryResource<LayerRevisionHistory> | null>(null);
  const [publications, setPublications] =
    useState<PublicationHistoryResource | null>(null);
  const [jobs, setJobs] = useState<PublicationJobListResource | null>(null);
  const [audit, setAudit] = useState<HistoryResource<AuditEvents> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [jobsError, setJobsError] = useState<unknown>(null);
  const [mutationError, setMutationError] = useState<unknown>(null);
  const [success, setSuccess] = useState<RollbackResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState<
    "revisions" | "publications" | "jobs" | "audit" | null
  >(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const successAlertRef = useRef<HTMLDivElement>(null);

  const reload = useCallback((preserveSuccess = false) => {
    setError(null);
    setJobsError(null);
    setMutationError(null);
    if (!preserveSuccess) setSuccess(null);
    setLoading(true);
    setReloadVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      Promise.all([
        transport.revisions(layerId, { limit: 25 }),
        transport.publications(layerId, { limit: 25 }),
        transport.audit(layerId, { limit: 25 }),
      ]),
      transport.jobs(layerId, { limit: 25 }),
    ])
      .then(([coreResult, jobsResult]) => {
        if (!active) return;
        if (coreResult.status === "fulfilled") {
          setRevisions(coreResult.value[0]);
          setPublications(coreResult.value[1]);
          setAudit(coreResult.value[2]);
        } else {
          setError(coreResult.reason);
        }
        if (jobsResult.status === "fulfilled" && jobsResult.value.data) {
          setJobs(jobsResult.value);
          setJobsError(null);
        } else if (jobsResult.status === "rejected") {
          setJobsError(jobsResult.reason);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [layerId, reloadVersion, transport]);

  useEffect(() => {
    if (success && !loading) successAlertRef.current?.focus();
  }, [loading, success]);

  async function moreRevisions() {
    if (!revisions?.data.nextCursor || loadingMore) return;
    setLoadingMore("revisions");
    try {
      const next = await transport.revisions(layerId, {
        limit: revisions.data.limit,
        cursor: revisions.data.nextCursor,
      });
      setRevisions({
        ...next,
        data: {
          ...next.data,
          items: [...revisions.data.items, ...next.data.items],
        },
      });
    } catch (reason) {
      setMutationError(reason);
    } finally {
      setLoadingMore(null);
    }
  }

  async function morePublications() {
    if (!publications?.data.nextCursor || loadingMore) return;
    setLoadingMore("publications");
    try {
      const next = await transport.publications(layerId, {
        limit: publications.data.limit,
        cursor: publications.data.nextCursor,
      });
      setPublications({
        ...next,
        data: {
          ...next.data,
          items: [...publications.data.items, ...next.data.items],
        },
      });
    } catch (reason) {
      setMutationError(reason);
    } finally {
      setLoadingMore(null);
    }
  }

  async function moreJobs() {
    if (!jobs?.data.nextCursor || loadingMore) return;
    setLoadingMore("jobs");
    try {
      const next = await transport.jobs(layerId, {
        limit: jobs.data.limit,
        cursor: jobs.data.nextCursor,
      });
      if (next.data)
        setJobs({
          ...next,
          data: {
            ...next.data,
            items: [...jobs.data.items, ...next.data.items],
          },
        });
    } catch (reason) {
      setMutationError(reason);
    } finally {
      setLoadingMore(null);
    }
  }

  async function moreAudit() {
    if (!audit?.data.nextCursor || loadingMore) return;
    setLoadingMore("audit");
    try {
      const next = await transport.audit(layerId, {
        limit: audit.data.limit,
        cursor: audit.data.nextCursor,
      });
      setAudit({
        ...next,
        data: {
          ...next.data,
          items: [...audit.data.items, ...next.data.items],
        },
      });
    } catch (reason) {
      setMutationError(reason);
    } finally {
      setLoadingMore(null);
    }
  }

  function rollbackSucceeded(result: RollbackResult) {
    setSuccess(result);
    setMutationError(null);
    reload(true);
  }

  function refreshAfterStaleRollback() {
    reload();
  }

  if (loading && !revisions) return <ScreenSkeleton />;
  if (error && (!revisions || !publications || !audit))
    return (
      <main className="mx-auto max-w-2xl p-4 pb-24 sm:p-6 md:pb-6">
        <AdminErrorNotice error={error} onRetry={reload} />
      </main>
    );
  if (!revisions || !publications || !audit) return null;

  const title = revisions.data.items[0]?.title ?? "Lớp dữ liệu";
  const pointer = publications.activePointerEtag;
  const publisherOnMobile =
    canPublishContent(principal.role) && !desktopCapable;

  return (
    <main
      className="mx-auto max-w-6xl p-4 pb-24 sm:p-6 md:p-8"
      aria-labelledby="publication-history-title"
      aria-busy={loading}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link href={`/admin/layers/${layerId}`}>
              <IconArrowLeft
                aria-hidden="true"
                data-icon="inline-start"
                strokeWidth={1.75}
              />
              Cấu hình lớp
            </Link>
          </Button>
          <h1
            id="publication-history-title"
            className="text-2xl font-semibold tracking-[-0.02em]"
          >
            Lịch sử {title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Xem các phiên bản, các lần công bố và lịch sử thao tác của lớp dữ liệu.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-controls="publication-history-content"
          aria-busy={loading}
          disabled={loading}
          onClick={() => reload()}
        >
          <IconRefresh
            aria-hidden="true"
            data-icon="inline-start"
            strokeWidth={1.75}
          />
          {loading ? "Đang làm mới..." : "Làm mới"}
        </Button>
      </header>

      <div id="publication-history-content">
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {loadingMore
            ? "Đang tải thêm dữ liệu lịch sử."
            : `Đã tải ${publications.data.items.length.toLocaleString("vi-VN")} lần công bố, ${revisions.data.items.length.toLocaleString("vi-VN")} phiên bản và ${audit.data.items.length.toLocaleString("vi-VN")} hoạt động.`}
        </p>
        <div className="mt-6 flex flex-col gap-4">
          {success && (
            <Alert
              ref={successAlertRef}
              tabIndex={-1}
              role="status"
              aria-atomic="true"
              className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconHistory aria-hidden="true" strokeWidth={1.75} />
              <AlertTitle>Khôi phục hoàn tất</AlertTitle>
              <AlertDescription>
                Bản đồ công khai đã được cập nhật theo bản bạn chọn.
              </AlertDescription>
            </Alert>
          )}
          {mutationError !== null && (
            <AdminErrorNotice error={mutationError} onRetry={() => reload()} />
          )}
          {publisherOnMobile && (
            <Alert>
              <IconShieldLock aria-hidden="true" strokeWidth={1.75} />
              <AlertTitle>Dùng máy tính để khôi phục dữ liệu</AlertTitle>
              <AlertDescription>
                Bạn có thể xem lịch sử và kiểm duyệt trên điện thoại. Việc khôi phục dữ liệu công khai cần thực hiện trên máy tính.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {(jobsError !== null || (jobs?.data.items.length ?? 0) > 0) && <section
          className="mt-8"
          aria-labelledby="publication-job-history-heading"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="publication-job-history-heading"
                className="text-lg font-semibold"
              >
                Tiến độ công bố
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Theo dõi các yêu cầu công bố đang xử lý và kết quả hoàn tất.
              </p>
            </div>
          </div>
          {jobsError !== null && (
            <Alert className="mt-4" role="status">
              <IconRefresh aria-hidden="true" strokeWidth={1.75} />
              <AlertTitle>Chưa thể tải tiến độ công bố</AlertTitle>
              <AlertDescription>
                <p>
                  Các phiên bản và lịch sử công bố vẫn xem được. Hãy thử tải lại tiến độ.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => reload()}
                >
                  <IconRefresh
                    aria-hidden="true"
                    data-icon="inline-start"
                    strokeWidth={1.75}
                  />
                  Tải lại tiến độ
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {jobs && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {jobs.data.items.map((job) => (
                  <PublicationJobStatus key={job.id} job={job} compact />
                ))}
              </div>
            )}
          {jobs?.data.hasMore && (
            <Button
              type="button"
              variant="outline"
              disabled={loadingMore !== null}
              onClick={moreJobs}
              className="mt-4"
            >
              {loadingMore === "jobs"
                ? "Đang tải thêm..."
                : "Xem thêm yêu cầu công bố"}
            </Button>
          )}
        </section>}

        <section
          className="mt-10"
          aria-labelledby="publication-history-heading"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="publication-history-heading"
                className="text-lg font-semibold"
              >
                Các lần công bố
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Bản đang hiển thị được đánh dấu bên dưới. Bạn có thể khôi phục một bản công bố trước nếu có quyền.
              </p>
            </div>
          </div>
          {publications.data.items.length === 0 ? (
            <Empty className="mt-4 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconDatabase strokeWidth={1.75} />
                </EmptyMedia>
                <EmptyTitle>Chưa có lần công bố nào</EmptyTitle>
                <EmptyDescription>
                  Lịch sử sẽ xuất hiện sau khi dữ liệu được công bố thành công.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="mt-4 rounded-panel border bg-surface">
              <Table>
                <TableCaption className="sr-only">
                  Các lần công bố của lớp, từ mới nhất đến cũ nhất.
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lần công bố</TableHead>
                    <TableHead>Phiên bản</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Tiến độ</TableHead>
                    <TableHead>Kích hoạt</TableHead>
                    <TableHead className="text-right">Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {publications.data.items.map((publication) => {
                    const canRollback =
                      canPublishContent(principal.role) &&
                      desktopCapable &&
                      publication.rollbackEligibility.eligible &&
                      pointer !== null;
                    return (
                      <TableRow key={publication.snapshotId}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">
                              {publication.generation}
                            </span>
                            {publication.isActive && <Badge>Đang hiển thị</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          #{publication.revisionNo}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {publication.featureCount.toLocaleString("vi-VN")}{" "}
                            đối tượng
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge>
                            {historyStatusLabel(publication.status)}
                          </Badge>
                          {publication.rollbackOf && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Khôi phục từ bản trước
                            </p>
                          )}
                        </TableCell>
                        <TableCell>{progressText(publication)}</TableCell>
                        <TableCell>
                          {historyDate(publication.activatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          {canRollback && pointer ? (
                            <RollbackDialog
                              layerId={layerId}
                              publication={publication}
                              activePointerEtag={pointer}
                              auth={{ csrfToken }}
                              transport={{ rollback: transport.rollback }}
                              onSuccess={rollbackSucceeded}
                              onStale={refreshAfterStaleRollback}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {publication.isActive ? "Đang sử dụng bản này" : publication.rollbackEligibility.eligible
                                ? publisherOnMobile
                                  ? "Cần dùng máy tính"
                                  : !canPublishContent(principal.role)
                                    ? "Cần quyền công bố dữ liệu"
                                    : "Hãy tải lại lịch sử trước khi khôi phục"
                                : eligibilityText(
                                    publication.rollbackEligibility.reasonCode,
                                  )}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {publications.data.hasMore && (
            <Button
              type="button"
              variant="outline"
              disabled={loadingMore !== null}
              onClick={morePublications}
              className="mt-4"
            >
              {loadingMore === "publications"
                ? "Đang tải thêm..."
                : "Xem thêm lần công bố"}
            </Button>
          )}
        </section>

        <section className="mt-10" aria-labelledby="revision-history-heading">
          <div>
            <h2 id="revision-history-heading" className="text-lg font-semibold">
              Các phiên bản
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Mở một phiên bản để kiểm tra dữ liệu, so sánh thay đổi và xem lịch sử duyệt.
            </p>
          </div>
          {revisions.data.items.length === 0 ? (
            <Empty className="mt-4 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconClock strokeWidth={1.75} />
                </EmptyMedia>
                <EmptyTitle>Chưa có phiên bản</EmptyTitle>
                <EmptyDescription>
                  Phiên bản đầu tiên được tạo cùng với lớp dữ liệu.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ol
              className="mt-4 divide-y rounded-panel border bg-surface"
              aria-label="Các phiên bản"
            >
              {revisions.data.items.map((revision) => (
                <li
                  key={revision.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        className="font-medium text-primary hover:underline"
                        href={`/admin/layers/${layerId}/revisions/${revision.id}/review`}
                      >
                        Phiên bản #{revision.revisionNo}
                      </Link>
                      <Badge>{historyStatusLabel(revision.status)}</Badge>
                      {revision.activeSnapshotId && (
                        <Badge>Lần công bố {revision.activeGeneration}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {revision.createdByDisplayName ?? "Người dùng nội bộ"},{" "}
                      {historyDate(revision.updatedAt)}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p>
                      {revision.featureCount.toLocaleString("vi-VN")} đối tượng
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {revision.participantCount} người tham gia
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {revisions.data.hasMore && (
            <Button
              type="button"
              variant="outline"
              disabled={loadingMore !== null}
              onClick={moreRevisions}
              className="mt-4"
            >
              {loadingMore === "revisions"
                ? "Đang tải thêm..."
                : "Xem thêm phiên bản"}
            </Button>
          )}
        </section>

        <section className="mt-10" aria-labelledby="audit-heading">
          <div className="mb-4">
            <h2 id="audit-heading" className="text-lg font-semibold">
              Nhật ký của lớp
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Các thao tác tạo, sửa, duyệt và công bố dữ liệu trong lớp này.
            </p>
          </div>
          <AuditEventList
            events={audit.data}
            loadingMore={loadingMore === "audit"}
            onLoadMore={audit.data.hasMore ? moreAudit : undefined}
          />
        </section>
      </div>
    </main>
  );
}
