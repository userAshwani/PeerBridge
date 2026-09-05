import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Share, Linking } from "react-native";
import { Text, Button, TextInput, Card, IconButton, Banner, useTheme } from "react-native-paper";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Directory } from "expo-file-system";
import { usePeerTransferSession } from "../lib/usePeerTransferSession";
import { getSavedDirectory, setSavedDirectory } from "../lib/save-location";
import { formatBytes } from "../lib/format";
import { StatusChip } from "../components/StatusChip";
import { TransferProgressView } from "../components/TransferProgressView";
import type { RootStackParamList } from "../navigation/RootNavigator";

const DOWNLOADS_SUBFOLDER = "PeerBridge";

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
    exportTo,
    receivedFile,
    accept,
    reject,
    cancel,
  } = usePeerTransferSession(roomId, "receiver");

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFileUri, setSavedFileUri] = useState<string | null>(null);
  const [savedFolderUri, setSavedFolderUri] = useState<string | null>(null);

  const join = useCallback(() => {
    const trimmed = codeInput.trim().toUpperCase();
    if (trimmed) setRoomId(trimmed);
  }, [codeInput]);

  // Deliberately no folder picker while a transfer is in progress: the
  // transfer starts immediately on accept. Opening the picker mid-
  // handshake pushed the app to the background right as the connection
  // was being set up, which is what made the transfer drop the moment a
  // save location was chosen. Choosing a destination happens only once
  // it can't break anything -- and only once, ever, per device: the
  // folder is remembered (see save-location.ts) so every transfer after
  // the first saves straight into a "PeerBridge" folder inside it with no
  // picker and no button tap at all.
  const saveReceivedFile = useCallback(
    async (directory: Directory) => {
      setSaveError(null);
      setSaveState("saving");
      try {
        let folder = new Directory(directory, DOWNLOADS_SUBFOLDER);
        if (!folder.exists) folder = directory.createDirectory(DOWNLOADS_SUBFOLDER);
        const savedUri = await exportTo(folder);
        setSavedFileUri(savedUri);
        setSavedFolderUri(folder.uri);
        setSaveState("saved");
      } catch (err) {
        setSaveState("idle");
        setSaveError(`Couldn't save there: ${String(err)}`);
      }
    },
    [exportTo],
  );

  // Runs automatically the moment a transfer completes: silent if a save
  // folder is already remembered, otherwise nothing happens until the user
  // taps "Choose folder" below (first time only, ever).
  useEffect(() => {
    if (!completed || saveState !== "idle") return;
    const dir = getSavedDirectory();
    if (dir) void saveReceivedFile(dir);
  }, [completed, saveState, saveReceivedFile]);

  const handleChooseFolder = useCallback(async () => {
    let dir: Directory;
    try {
      dir = await Directory.pickDirectoryAsync();
    } catch {
      return; // picker dismissed — file is still safe in the app's storage
    }
    setSavedDirectory(dir);
    await saveReceivedFile(dir);
  }, [saveReceivedFile]);

  const handleOpenFile = useCallback(async () => {
    if (!savedFileUri) return;
    try {
      await Linking.openURL(savedFileUri);
    } catch {
      setSaveError("Couldn't open that file — try Share instead.");
    }
  }, [savedFileUri]);

  const handleOpenFolder = useCallback(async () => {
    if (!savedFolderUri) return;
    try {
      await Linking.openURL(savedFolderUri);
    } catch {
      setSaveError("Couldn't open the folder — your file manager may not support this.");
    }
  }, [savedFolderUri]);

  const handleShare = useCallback(async () => {
    const file = receivedFile();
    if (!file) return;
    try {
      await Share.share({ url: file.uri, message: file.uri });
    } catch {
      // share sheet dismissed
    }
  }, [receivedFile]);

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
              <Button mode="contained" onPress={accept}>
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
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
                {saveState === "saved"
                  ? `Saved to your ${DOWNLOADS_SUBFOLDER} folder.`
                  : saveState === "saving"
                    ? "Saving…"
                    : "Choose a folder once — every file after this saves there automatically."}
              </Text>
            </Card.Content>
            <Card.Actions style={styles.completedActions}>
              <Button mode="outlined" icon="share-variant" onPress={handleShare}>
                Share
              </Button>
              {saveState === "saved" ? (
                <>
                  <Button mode="outlined" icon="folder-open" onPress={handleOpenFolder}>
                    Open folder
                  </Button>
                  <Button mode="contained" icon="file-eye" onPress={handleOpenFile}>
                    Open file
                  </Button>
                </>
              ) : (
                <Button
                  mode="contained"
                  icon="folder-outline"
                  loading={saveState === "saving"}
                  disabled={saveState === "saving"}
                  onPress={handleChooseFolder}
                >
                  Choose folder
                </Button>
              )}
            </Card.Actions>
          </Card>
        )}

        {saveError && (
          <Banner visible icon="alert-circle" style={[styles.banner, { backgroundColor: theme.colors.errorContainer }]}>
            {saveError}
          </Banner>
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
  completedActions: { justifyContent: "center", gap: 8, paddingBottom: 12 },
});
