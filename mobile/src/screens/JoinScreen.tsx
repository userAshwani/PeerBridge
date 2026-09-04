import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Text, Button, TextInput, Card, IconButton, Banner, useTheme } from "react-native-paper";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Directory } from "expo-file-system";
import { usePeerTransferSession } from "../lib/usePeerTransferSession";
import { formatBytes } from "../lib/format";
import { StatusChip } from "../components/StatusChip";
import { TransferProgressView } from "../components/TransferProgressView";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Join">;

const TERMINAL = ["completed", "cancelled", "closed", "error", "rejected"];

export function JoinScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const [codeInput, setCodeInput] = useState(route.params?.code ?? "");
  const [roomId, setRoomId] = useState<string | null>(route.params?.code?.toUpperCase() ?? null);

  useEffect(() => {
    if (route.params?.code) {
      const code = route.params.code.toUpperCase();
      setCodeInput(code);
      setRoomId(code);
    }
  }, [route.params?.code]);

  const {
    status,
    progress,
    incomingBatch,
    completed,
    errorMessage,
    noticeMessage,
    setTargetDirectory,
    accept,
    reject,
    cancel,
  } = usePeerTransferSession(roomId, "receiver");

  const join = useCallback(() => {
    const trimmed = codeInput.trim().toUpperCase();
    if (trimmed) setRoomId(trimmed);
  }, [codeInput]);

  const handleAccept = useCallback(async () => {
    try {
      const dir = await Directory.pickDirectoryAsync();
      setTargetDirectory(dir);
    } catch {
      // User cancelled the folder picker — falls back to the app's own
      // document directory (setTargetDirectory left at its null default).
    }
    accept();
  }, [accept, setTargetDirectory]);

  if (!roomId) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.enterContainer}>
          <Text variant="titleMedium">Have a code?</Text>
          <TextInput
            mode="outlined"
            value={codeInput}
            onChangeText={(t) => setCodeInput(t.toUpperCase())}
            placeholder="ABC123"
            autoCapitalize="characters"
            maxLength={6}
            style={styles.input}
            contentStyle={{ textAlign: "center", letterSpacing: 4 }}
          />
          <Button mode="contained" onPress={join} disabled={!codeInput.trim()} style={styles.joinButton}>
            Join
          </Button>
          <Button
            mode="outlined"
            icon="qrcode-scan"
            onPress={() => navigation.navigate("Scan")}
            style={styles.joinButton}
          >
            Scan QR code
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const roomExpired = Boolean(errorMessage?.toLowerCase().includes("room not found"));

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text variant="titleLarge">
          Joining <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>{roomId}</Text>
        </Text>
        <StatusChip status={status} />

        {roomExpired && (
          <Banner
            visible
            icon="alert-circle"
            style={[styles.banner, { backgroundColor: theme.colors.errorContainer }]}
          >
            This room code doesn&apos;t exist or has expired.
          </Banner>
        )}

        {status === "awaiting-accept" && incomingBatch && (
          <Card mode="outlined" style={styles.fileCard}>
            <Card.Content style={styles.fileRow}>
              <IconButton icon="file-outline" size={28} iconColor={theme.colors.primary} style={{ margin: 0 }} />
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" numberOfLines={1}>
                  {incomingBatch.files[0]?.name}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {formatBytes(incomingBatch.totalBytes)}
                </Text>
              </View>
            </Card.Content>
            <Card.Actions>
              <Button mode="outlined" onPress={reject}>
                Decline
              </Button>
              <Button mode="contained" onPress={handleAccept}>
                Accept
              </Button>
            </Card.Actions>
          </Card>
        )}

        {progress && (status === "transferring" || status === "verifying") && (
          <TransferProgressView progress={progress} showEta={status === "transferring"} />
        )}

        {completed && (
          <Card mode="outlined" style={styles.fileCard}>
            <Card.Content style={{ alignItems: "center", gap: 8 }}>
              <IconButton
                icon={completed.files.every((f) => f.verified) ? "check-circle" : "alert-circle"}
                size={40}
                iconColor={completed.files.every((f) => f.verified) ? theme.colors.tertiary : theme.colors.error}
              />
              <Text variant="titleMedium">
                {completed.files.every((f) => f.verified) ? "Transfer verified" : "Integrity check failed"}
              </Text>
              {completed.savedTo && (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
                  Saved to your chosen location
                </Text>
              )}
            </Card.Content>
          </Card>
        )}

        {noticeMessage && (
          <Banner visible icon="information" style={styles.banner}>
            {noticeMessage}
          </Banner>
        )}
        {errorMessage && !roomExpired && (
          <Banner
            visible
            icon="alert-circle"
            style={[styles.banner, { backgroundColor: theme.colors.errorContainer }]}
          >
            {errorMessage}
          </Banner>
        )}

        {!TERMINAL.includes(status) && !roomExpired && (
          <Button mode="text" icon="close-circle-outline" onPress={cancel} textColor={theme.colors.error}>
            Cancel
          </Button>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  enterContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  input: { width: "100%" },
  joinButton: { width: "100%", borderRadius: 24, marginTop: 4 },
  container: { padding: 20, gap: 16, alignItems: "center" },
  fileCard: { width: "100%", borderRadius: 16 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  banner: { width: "100%", borderRadius: 16, overflow: "hidden" },
});
