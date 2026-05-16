export const themeOptions = [
  { value: "sand", label: "Sandstone" },
  { value: "harbor", label: "Harbor" },
  { value: "grove", label: "Grove" },
  { value: "ember", label: "Ember" },
  { value: "dark", label: "Dark" },
  { value: "macchiato", label: "Macchiato" },
  { value: "macchiato2", label: "Macchiato 2" },
] as const;

export type BoardTheme = (typeof themeOptions)[number]["value"];

export const defaultTheme: BoardTheme = "macchiato2";
export const themeStorageKey = "gtd-board-theme";

export function isBoardTheme(value: string): value is BoardTheme {
  return themeOptions.some((option) => option.value === value);
}
