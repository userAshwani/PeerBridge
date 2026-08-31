"use client";

import { useEffect, useState } from "react";
import { getSignalingUrl } from "@/lib/signaling-client";

// Free-tier hosts (e.g. Render) spin a sleeping instance back up on the
// first request, which can take 30-40s — long enough that the very first
// WebSocket connection attempt often needs a few retries while the
// container boots. This hook surfaces that as a friendly "waking up"
// state instead of a silent, confusing hang.

export type RelayStatus = "waking" | "connected" | "reconnecting";

export interface RelayStatusResult {
  status: RelayStatus;
  latencyMs: number | null;
}

const PING_INTERVAL_MS = 5000;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;

export function useRelayStatus(): RelayStatusResult {
  const [status, setStatus] = useState<RelayStatus>("waking");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = INITIAL_BACKOFF_MS;
    let everConnected = false;
    let lastPingSentAt = 0;

    const stopPinging = () => {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
    };

    const sendPing = () => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      lastPingSentAt = performance.now();
      ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
    };

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(getSignalingUrl());

      ws.onopen = () => {
        everConnected = true;
        backoff = INITIAL_BACKOFF_MS;
        setStatus("connected");
        sendPing();
        pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "pong") {
            setLatencyMs(Math.round(performance.now() - lastPingSentAt));
          }
        } catch {
          // ignore malformed frames
        }
      };

      const scheduleReconnect = () => {
        stopPinging();
        if (cancelled) return;
        setStatus(everConnected ? "reconnecting" : "waking");
        reconnectTimer = setTimeout(() => {
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
          connect();
        }, backoff);
      };

      ws.onclose = scheduleReconnect;
      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      cancelled = true;
      stopPinging();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  return { status, latencyMs };
}
