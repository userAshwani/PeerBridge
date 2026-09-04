import { MD3LightTheme, MD3Theme } from "react-native-paper";
import color from "color";
import { BRAND_COLOR } from "./constants";

// react-native-paper's MD3LightTheme only lets you override `primary` for
// free — every other token (containers, surfaceVariant, outline, and every
// elevation level a Card/Surface actually paints its background with) is a
// literal color baked in from Material 3's *default purple* seed, not
// derived from `primary`. Overriding only `primary` therefore mismatches a
// blue accent against purple-tinted card surfaces — this derives the full
// palette from BRAND_COLOR instead, the way Material Theme Builder would,
// so every surface Paper renders is coherently blue. Still 100% Paper
// components underneath; this only configures color tokens Paper already
// reads from `theme.colors`.
const primary = color(BRAND_COLOR);
const secondary = color(BRAND_COLOR).desaturate(0.35).darken(0.15);
const tertiary = color("#2E7D5B"); // complementary green accent, used sparingly (e.g. success states)
const neutralOutline = color("#79747E");
const neutralOutlineVariant = color("#C4C7C5");

const tint = (c: color, whiteWeight: number) => c.mix(color("white"), whiteWeight).hex();
const shade = (c: color, blackWeight: number) => c.mix(color("black"), blackWeight).hex();

export const theme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: primary.hex(),
    onPrimary: "#FFFFFF",
    primaryContainer: tint(primary, 0.88),
    onPrimaryContainer: shade(primary, 0.75),

    secondary: secondary.hex(),
    onSecondary: "#FFFFFF",
    secondaryContainer: tint(secondary, 0.85),
    onSecondaryContainer: shade(secondary, 0.7),

    tertiary: tertiary.hex(),
    onTertiary: "#FFFFFF",
    tertiaryContainer: tint(tertiary, 0.85),
    onTertiaryContainer: shade(tertiary, 0.75),

    surface: "#FFFFFF",
    surfaceVariant: tint(primary, 0.93),
    onSurfaceVariant: shade(primary, 0.62),
    background: "#FFFFFF",
    onBackground: shade(primary, 0.85),
    onSurface: shade(primary, 0.85),

    outline: neutralOutline.mix(primary, 0.35).hex(),
    outlineVariant: neutralOutlineVariant.mix(primary, 0.25).hex(),

    inverseSurface: shade(primary, 0.85),
    inverseOnSurface: tint(primary, 0.92),
    inversePrimary: tint(primary, 0.55),

    elevation: {
      level0: "transparent",
      level1: tint(primary, 0.95),
      level2: tint(primary, 0.92),
      level3: tint(primary, 0.89),
      level4: tint(primary, 0.88),
      level5: tint(primary, 0.86),
    },
  },
};
