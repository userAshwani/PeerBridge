import React, { useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Text, Button } from "react-native-paper";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Scan">;

// Extracts a 6-character room code from either a bare code or a full
// join link (https://transfer.ashwanitiwari.com/join/ABC123) — the web
// app's QR always encodes the full link, so this has to handle that shape.
function extractRoomCode(scanned: string): string | null {
  const match = scanned.match(/([A-Z0-9]{6})\s*$/i);
  return match ? match[1].toUpperCase() : null;
}

export function ScanScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanned) return;
      const code = extractRoomCode(data);
      if (!code) return;
      setScanned(true);
      navigation.replace("Join", { code });
    },
    [navigation, scanned],
  );

  if (!permission) return <View style={styles.safe} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text variant="titleMedium" style={{ textAlign: "center", marginBottom: 16 }}>
            Camera access is needed to scan a QR code
          </Text>
          <Button mode="contained" onPress={requestPermission}>
            Allow camera
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.safe}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={handleScanned}
      />
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>Point your camera at the sender&apos;s QR code</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  frame: { width: 240, height: 240, borderWidth: 3, borderColor: "#ffffff", borderRadius: 16 },
  hint: { color: "#ffffff", fontSize: 14 },
});
