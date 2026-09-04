import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeScreen } from "../screens/HomeScreen";
import { SendScreen } from "../screens/SendScreen";
import { JoinScreen } from "../screens/JoinScreen";
import { ScanScreen } from "../screens/ScanScreen";
import { APP_NAME } from "../lib/constants";

export type RootStackParamList = {
  Home: undefined;
  Send: undefined;
  Join: { code?: string } | undefined;
  Scan: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#18181b",
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: APP_NAME }} />
      <Stack.Screen name="Send" component={SendScreen} options={{ title: "Send a file" }} />
      <Stack.Screen name="Join" component={JoinScreen} options={{ title: "Receive a file" }} />
      <Stack.Screen
        name="Scan"
        component={ScanScreen}
        options={{ title: "Scan QR code", presentation: "fullScreenModal" }}
      />
    </Stack.Navigator>
  );
}
