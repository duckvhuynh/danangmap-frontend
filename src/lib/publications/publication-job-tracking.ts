"use client";

import { useEffect, useRef, useState } from "react";
import {
  getPublicationJob,
  type PublicationJob,
  type PublicationJobResource,
} from "@/lib/api/publication-jobs";

export type PublicationTrackingState = "connected" | "disconnected" | "paused";
export interface PublicationTrackingIssue {
  code: "PUBLICATION_JOB_REPRESENTATION_REJECTED";
  userMessage: string;
}

const phaseRank: Record<PublicationJob["phase"], number> = {
  queued: 0,
  preparing: 1,
  scanning_features: 2,
  switching: 3,
  completed: 4,
  failed: 4,
};

export function isTerminalPublicationJob(job: PublicationJob) {
  return job.status === "succeeded" || job.status === "failed";
}

function transitionAllowed(current: PublicationJob["status"], incoming: PublicationJob["status"]) {
  if (current === "queued") return incoming === "queued" || incoming === "building" || incoming === "succeeded" || incoming === "failed";
  if (current === "building") return incoming === "queued" || incoming === "building" || incoming === "succeeded" || incoming === "failed";
  return false;
}

export function selectLatestPublicationJob(
  current: PublicationJob | null,
  incoming: PublicationJob,
  options: { versionChanged?: boolean } = {},
) {
  if (!current || current.id !== incoming.id) return incoming;
  if (isTerminalPublicationJob(current)) return current;
  const currentTime = Date.parse(current.updatedAt);
  const incomingTime = Date.parse(incoming.updatedAt);
  if (!options.versionChanged && incomingTime <= currentTime) return current;
  if (!transitionAllowed(current.status, incoming.status)) return current;
  if (current.status === "building" && incoming.status === "building" && phaseRank[incoming.phase] < phaseRank[current.phase]) return current;
  if (incoming.attempt < current.attempt) return current;
  if (incoming.progress.completedUnits < current.progress.completedUnits) return current;
  if (current.progress.totalUnits !== null && incoming.progress.totalUnits === null) return current;
  if (current.progress.totalUnits !== null && incoming.progress.totalUnits !== current.progress.totalUnits) return current;
  if (current.progress.percent !== null && incoming.progress.percent !== null && incoming.progress.percent < current.progress.percent) return current;
  return incoming;
}

export type PublicationJobSeed = PublicationJobResource;

export interface PublicationJobTrackingTransport {
  get: typeof getPublicationJob;
}

const defaultTransport: PublicationJobTrackingTransport = { get: getPublicationJob };
const DEFAULT_POLL_DELAY_MS = 2_000;
const HIDDEN_POLL_DELAY_MS = 15_000;
const MAX_TRANSIENT_BACKOFF_MS = 30_000;

function isAbortError(reason: unknown) {
  return (reason instanceof DOMException && reason.name === "AbortError")
    || (typeof reason === "object" && reason !== null && "name" in reason && reason.name === "AbortError");
}

function currentTrackingState(): PublicationTrackingState {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "disconnected";
  if (typeof document !== "undefined" && document.hidden) return "paused";
  return "connected";
}

export function usePublicationJobTracking({
  seed,
  resetKey,
  enabled = true,
  transport = defaultTransport,
}: {
  seed: PublicationJobSeed | null;
  /** Changing this owner identity clears all confirmed tracking state. A null seed with the same key is a no-op. */
  resetKey: string;
  enabled?: boolean;
  transport?: PublicationJobTrackingTransport;
}) {
  const [job, setJob] = useState<PublicationJob | null>(seed?.data ?? null);
  const [trackingState, setTrackingState] = useState<PublicationTrackingState>(currentTrackingState);
  const [trackingIssue, setTrackingIssue] = useState<PublicationTrackingIssue | null>(null);
  const [trackedResetKey, setTrackedResetKey] = useState(resetKey);
  const jobRef = useRef<PublicationJob | null>(seed?.data ?? null);
  const etagRef = useRef(seed?.etag ?? null);
  const retryAfterRef = useRef(seed?.retryAfterMs ?? DEFAULT_POLL_DELAY_MS);
  const resetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      jobRef.current = null;
      etagRef.current = null;
      retryAfterRef.current = DEFAULT_POLL_DELAY_MS;
      setTrackedResetKey(resetKey);
      setJob(null);
      setTrackingIssue(null);
      setTrackingState(currentTrackingState());
    }
    if (!seed) return;
    const next = selectLatestPublicationJob(jobRef.current, seed.data, {
      versionChanged: Boolean(seed.etag) && seed.etag !== etagRef.current,
    });
    if (next !== seed.data) return;
    jobRef.current = next;
    etagRef.current = seed.etag || null;
    retryAfterRef.current = seed.retryAfterMs;
    setJob(next);
    setTrackingIssue(null);
  }, [resetKey, seed]);

  useEffect(() => {
    if (!enabled || !jobRef.current || isTerminalPublicationJob(jobRef.current)) return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let request: AbortController | null = null;
    let transientBackoffMs = 1_000;

    const clearTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };

    const schedule = (delayMs: number) => {
      if (disposed || isTerminalPublicationJob(jobRef.current!)) return;
      clearTimer();
      const delay = document.hidden ? Math.max(delayMs, HIDDEN_POLL_DELAY_MS) : delayMs;
      if (document.hidden) setTrackingState("paused");
      timer = setTimeout(() => { void poll(); }, delay);
    };

    const poll = async () => {
      clearTimer();
      const current = jobRef.current;
      if (disposed || !current || isTerminalPublicationJob(current)) return;
      if (navigator.onLine === false) {
        setTrackingState("disconnected");
        return;
      }
      request?.abort();
      const currentRequest = new AbortController();
      request = currentRequest;
      try {
        const result = await transport.get(current.id, {
          ...(etagRef.current ? { etag: etagRef.current } : {}),
          signal: currentRequest.signal,
        });
        if (disposed || request !== currentRequest) return;
        if (result.data) {
          const next = selectLatestPublicationJob(jobRef.current, result.data, {
            versionChanged: result.etag !== etagRef.current,
          });
          if (next === result.data) {
            jobRef.current = next;
            etagRef.current = result.etag;
            retryAfterRef.current = result.retryAfterMs;
            transientBackoffMs = 1_000;
            setJob(next);
            setTrackingIssue(null);
            setTrackingState(document.hidden ? "paused" : "connected");
          } else {
            setTrackingIssue({
              code: "PUBLICATION_JOB_REPRESENTATION_REJECTED",
              userMessage: "Chưa nhận được tiến độ mới nhất. Kết quả đã xác nhận vẫn được giữ; hệ thống sẽ tiếp tục kiểm tra.",
            });
            setTrackingState("disconnected");
          }
        } else {
          retryAfterRef.current = result.retryAfterMs;
          transientBackoffMs = 1_000;
          setTrackingIssue(null);
          setTrackingState(document.hidden ? "paused" : "connected");
        }
        if (jobRef.current && !isTerminalPublicationJob(jobRef.current)) schedule(retryAfterRef.current);
      } catch (reason) {
        if (disposed || request !== currentRequest || isAbortError(reason)) return;
        setTrackingState("disconnected");
        schedule(Math.max(retryAfterRef.current, transientBackoffMs));
        transientBackoffMs = Math.min(MAX_TRANSIENT_BACKOFF_MS, transientBackoffMs * 2);
      }
    };

    const resumeImmediately = () => {
      if (disposed || !jobRef.current || isTerminalPublicationJob(jobRef.current)) return;
      if (navigator.onLine === false) {
        clearTimer();
        request?.abort();
        setTrackingState("disconnected");
        return;
      }
      if (document.hidden) {
        setTrackingState("paused");
        schedule(retryAfterRef.current);
        return;
      }
      clearTimer();
      request?.abort();
      void poll();
    };

    const handleVisibility = () => {
      if (document.hidden) {
        request?.abort();
        schedule(retryAfterRef.current);
      } else {
        resumeImmediately();
      }
    };

    const handleOffline = () => {
      clearTimer();
      request?.abort();
      setTrackingState("disconnected");
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", resumeImmediately);
    window.addEventListener("online", resumeImmediately);
    window.addEventListener("offline", handleOffline);
    schedule(retryAfterRef.current);

    return () => {
      disposed = true;
      clearTimer();
      request?.abort();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", resumeImmediately);
      window.removeEventListener("online", resumeImmediately);
      window.removeEventListener("offline", handleOffline);
    };
  }, [enabled, resetKey, seed?.data.id, transport]);

  const resetPending = trackedResetKey !== resetKey;
  return {
    job: resetPending ? null : job,
    trackingState: resetPending ? currentTrackingState() : trackingState,
    trackingIssue: resetPending ? null : trackingIssue,
  };
}
