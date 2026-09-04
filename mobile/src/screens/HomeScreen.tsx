import React from "react";
import { View, StyleSheet } from "react-native";
import { Text, Card, Avatar, useTheme } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

// Mirrors the web app's minimal homepage: one clear module, two actions.
// Every visual element below is a React Native Paper component (Card,
// Avatar.Icon, Text) driven by the shared theme — the StyleSheet only
// handles layout (flex/padding/gap), not colors, borders, or shadows.
export function HomeScreen({ navigation }: Props) {
  const theme = useTheme();

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text variant="headlineMedium" style={styles.title}>
            Send files, instantly
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Direct, encrypted, no size limit. Nothing ever touches a server.
          </Text>
        </View>

        <Card style={styles.card} mode="elevated" onPress={() => navigation.navigate("Send")}>
          <Card.Content style={styles.cardContent}>
            <Avatar.Icon
              size={52}
              icon={({ size, color }) => <MaterialCommunityIcons name="tray-arrow-up" size={size} color={color} />}
              color={theme.colors.onPrimaryContainer}
              style={{ backgroundColor: theme.colors.primaryContainer }}
            />
            <View style={styles.cardText}>
              <Text variant="titleMedium">Send a file</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Pick a file and share the room code
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
          </Card.Content>
        </Card>

        <Card style={styles.card} mode="elevated" onPress={() => navigation.navigate("Join")}>
          <Card.Content style={styles.cardContent}>
            <Avatar.Icon
              size={52}
              icon={({ size, color }) => <MaterialCommunityIcons name="tray-arrow-down" size={size} color={color} />}
              color={theme.colors.onSecondaryContainer}
              style={{ backgroundColor: theme.colors.secondaryContainer }}
            />
            <View style={styles.cardText}>
              <Text variant="titleMedium">Receive a file</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Enter a room code or scan a QR
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
          </Card.Content>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, padding: 24, gap: 16 },
  hero: { gap: 6, marginTop: 24, marginBottom: 12 },
  title: { fontWeight: "700" },
  card: { borderRadius: 16 },
  cardContent: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 6 },
  cardText: { flex: 1 },
});
