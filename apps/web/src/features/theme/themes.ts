export const themeOptions = [
  { value: "sand", label: "Sandstone" },
  { value: "harbor", label: "Harbor" },
  { value: "grove", label: "Grove" },
  { value: "ember", label: "Ember" },
  { value: "dark", label: "Dark" },
  { value: "macchiato", label: "Macchiato" },
] as const;

export type BoardTheme = (typeof themeOptions)[number]["value"];

export const defaultTheme: BoardTheme = "sand";
export const themeStorageKey = "gtd-board-theme";

export function isBoardTheme(value: string): value is BoardTheme {
  return themeOptions.some((option) => option.value === value);
}
