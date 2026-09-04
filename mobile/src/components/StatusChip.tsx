import React from "react";
import { Chip, useTheme } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { TransferStatus } from "../lib/webrtc-session";

const LABELS: Record<TransferStatus, string> = {
  idle: "Idle",
  "connecting-signaling": "Connecting…",
  "waiting-for-peer": "Waiting for peer",
  "establishing-connection": "Negotiating link",
  connected: "Connected",
  "awaiting-accept": "Awaiting response",
  transferring: "Transferring",
  verifying: "Verifying integrity",
  completed: "Completed",
  rejected: "Declined",
  reconnecting: "Reconnecting…",
  cancelled: "Cancelled",
  error: "Error",
  closed: "Closed",
};

const ACTIVE: TransferStatus[] = [
  "connecting-signaling",
  "waiting-for-peer",
  "establishing-connection",
  "transferring",
  "verifying",
];
const WARNING: TransferStatus[] = ["reconnecting"];
const BAD: TransferStatus[] = ["error", "rejected", "closed", "cancelled"];

export function StatusChip({ status }: { status: TransferStatus }) {
  const theme = useTheme();
  const isDone = status === "completed";
  const isBad = BAD.includes(status);
  const isWarning = WARNING.includes(status);
  const isActive = ACTIVE.includes(status);

  const iconName = isDone
    ? "check-circle"
    : isBad
      ? "close-circle"
      : isWarning
        ? "alert-circle"
        : isActive
          ? "sync"
          : "circle-outline";

  // Color-codes by outcome so an error/success state reads at a glance —
  // the plain neutral outline every status shared before made "Error" and
  // "Completed" look identical.
  const [bg, fg] = isDone
    ? [theme.colors.tertiaryContainer, theme.colors.onTertiaryContainer]
    : isBad
      ? [theme.colors.errorContainer, theme.colors.onErrorContainer]
      : isWarning
        ? ["#FFF3DC", "#7A4E00"]
        : isActive
          ? [theme.colors.primaryContainer, theme.colors.onPrimaryContainer]
          : [theme.colors.surfaceVariant, theme.colors.onSurfaceVariant];

  return (
    <Chip
      mode="flat"
      style={{ backgroundColor: bg }}
      textStyle={{ color: fg }}
      icon={({ size }) => <MaterialCommunityIcons name={iconName} size={size} color={fg} />}
    >
      {LABELS[status]}
    </Chip>
  );
}
