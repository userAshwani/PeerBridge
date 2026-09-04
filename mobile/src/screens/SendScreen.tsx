import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Share } from "react-native";
import { Text, Button, Card, IconButton, Snackbar, Banner, useTheme } from "react-native-paper";
import * as Clipboard from "expo-clipboard";
import { File } from "expo-file-system";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePeerTransferSession } from "../lib/usePeerTransferSession";
import { generateRoomCode } from "../lib/room-code";
import { formatBytes } from "../lib/format";
import { WEB_APP_URL } from "../lib/constants";
import { StatusChip } from "../components/StatusChip";
import { TransferProgressView } from "../components/TransferProgressView";

const TERMINAL = ["completed", "cancelled", "closed", "error", "rejected"];

export function SendScreen() {
  const theme = useTheme();
  const [file, setFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const roomId = useMemo(() => (file ? generateRoomCode() : null), [file]);

  const { status, progress, errorMessage, noticeMessage, setFile: pushFile, cancel } = usePeerTransferSession(
    roomId,
    "sender",
  );

  const shareUrl = roomId ? `${WEB_APP_URL}/join/${roomId}` : "";

  const pickFile = useCallback(async () => {
    const picked = await File.pickFileAsync();
    if (picked.canceled) return;
    setFile(picked.result);
    // pushFile targets the session created by the *next* render (roomId
    // only becomes non-null once `file` state above updates), so defer
    // one tick — mirrors the same pattern the web app uses for the same
    // reason (hooks/usePeerTransfer.ts + app/page.tsx).
    queueMicrotask(() => pushFile(picked.result));
  }, [pushFile]);

  const copyLink = useCallback(async () => {
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
  }, [shareUrl]);

  const shareLink = useCallback(async () => {
    try {
      await Share.share({ message: `Join my file transfer on PeerBridge: ${shareUrl}` });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  }, [shareUrl]);

  const reset = useCallback(() => {
    if (roomId && !TERMINAL.includes(status)) cancel();
    setFile(null);
  }, [roomId, status, cancel]);

  if (!file) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.pickContainer}>
          <IconButton icon="tray-arrow-up" size={56} iconColor={theme.colors.primary} />
          <Text variant="titleMedium" style={styles.pickTitle}>
            Pick a file to send
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
            No size limit — streamed directly to your peer, never uploaded anywhere.
          </Text>
          <Button mode="contained" onPress={pickFile} style={styles.pickButton}>
            Choose file
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Card mode="outlined" style={styles.fileCard}>
          <Card.Content style={styles.fileRow}>
            <IconButton icon="file-outline" size={28} iconColor={theme.colors.primary} style={{ margin: 0 }} />
            <View style={{ flex: 1 }}>
              <Text variant="titleSmall" numberOfLines={1}>
                {file.name}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {formatBytes(file.size)}
              </Text>
            </View>
            <IconButton icon="close" onPress={reset} />
          </Card.Content>
        </Card>

        {roomId && (
          <View style={styles.qrWrap}>
            <View style={[styles.qrBox, { borderColor: theme.colors.outlineVariant }]}>
              <QRCode value={shareUrl} size={180} color={theme.colors.onSurface} backgroundColor={theme.colors.surface} />
            </View>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
              ROOM CODE
            </Text>
            <Text variant="displaySmall" style={{ color: theme.colors.primary, fontWeight: "700", letterSpacing: 4 }}>
              {roomId}
            </Text>

            <View style={styles.actionsRow}>
              <Button mode="contained" icon="share-variant" onPress={shareLink}>
                Share
              </Button>
              <Button mode="outlined" icon="content-copy" onPress={copyLink}>
                Copy link
              </Button>
            </View>
          </View>
        )}

        <StatusChip status={status} />

        {progress && (status === "transferring" || status === "verifying") && (
          <TransferProgressView progress={progress} showEta={status === "transferring"} />
        )}

        {status === "completed" && (
          <Banner
            visible
            icon="check-circle"
            style={[styles.banner, { backgroundColor: theme.colors.tertiaryContainer }]}
          >
            Transfer complete.
          </Banner>
        )}
        {noticeMessage && (
          <Banner visible icon="information" style={styles.banner}>
            {noticeMessage}
          </Banner>
        )}
        {errorMessage && (
          <Banner
            visible
            icon="alert-circle"
            style={[styles.banner, { backgroundColor: theme.colors.errorContainer }]}
          >
            {errorMessage}
          </Banner>
        )}

        {!TERMINAL.includes(status) && (
          <Button mode="text" icon="close-circle-outline" onPress={reset} textColor={theme.colors.error}>
            Cancel transfer
          </Button>
        )}
      </ScrollView>

      <Snackbar visible={copied} onDismiss={() => setCopied(false)} duration={1500}>
        Link copied
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  pickContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  pickTitle: { marginTop: 8 },
  pickButton: { marginTop: 16, borderRadius: 24, paddingHorizontal: 8 },
  container: { padding: 20, gap: 16, alignItems: "center" },
  fileCard: { width: "100%", borderRadius: 16 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  qrWrap: { alignItems: "center", width: "100%" },
  qrBox: { padding: 16, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  banner: { width: "100%", borderRadius: 16, overflow: "hidden" },
});
