import React from "react";
import { View, StyleSheet } from "react-native";
import { Text, ProgressBar, useTheme } from "react-native-paper";
import type { TransferProgress } from "../lib/webrtc-session";
import { formatBytes, formatDuration, formatSpeed } from "../lib/format";

export function TransferProgressView({ progress, showEta }: { progress: TransferProgress; showEta: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <ProgressBar progress={Math.min(1, progress.percent / 100)} color={theme.colors.primary} style={styles.bar} />
      <View style={styles.row}>
        <Text variant="bodySmall">
          {formatBytes(progress.bytesTransferred)} / {formatBytes(progress.totalBytes)}
        </Text>
        <Text variant="bodySmall">{formatSpeed(progress.speedBps)}</Text>
      </View>
      {showEta && (
        <Text variant="bodySmall" style={styles.eta}>
          {formatDuration(progress.etaSeconds)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", gap: 6 },
  bar: { height: 8, borderRadius: 4 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  eta: { textAlign: "center" },
});
