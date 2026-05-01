import { useEffect, useState } from "react";

import {
  defaultTheme,
  isBoardTheme,
  themeStorageKey,
  type BoardTheme,
} from "./themes";

export function useBoardTheme() {
  const [theme, setTheme] = useState<BoardTheme>(() => {
    if (typeof window === "undefined") {
      return defaultTheme;
    }

    const storedTheme = window.localStorage.getItem(themeStorageKey);
    return storedTheme && isBoardTheme(storedTheme) ? storedTheme : defaultTheme;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  return {
    theme,
    setTheme,
  };
}
