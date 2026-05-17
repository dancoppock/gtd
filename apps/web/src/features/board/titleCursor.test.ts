import { describe, expect, it } from "vitest";

import {
  moveTitleCursorToNextWord,
  moveTitleCursorToPreviousWord,
  resolveNavigationTitleCursorIndex,
} from "./titleCursor";

describe("title cursor helpers", () => {
  it("moves to the next word start with vim-style w", () => {
    expect(moveTitleCursorToNextWord("Refine compact ticket card", 0)).toBe(7);
    expect(moveTitleCursorToNextWord("Refine compact ticket card", 9)).toBe(15);
  });

  it("treats punctuation as a motion target for w and skips it for W", () => {
    expect(moveTitleCursorToNextWord("Fix API-client tests", 4)).toBe(7);
    expect(moveTitleCursorToNextWord("Fix API-client tests", 4, true)).toBe(15);
  });

  it("moves to the previous word start with vim-style b", () => {
    expect(moveTitleCursorToPreviousWord("Refine compact ticket card", 16)).toBe(15);
    expect(moveTitleCursorToPreviousWord("Refine compact ticket card", 14)).toBe(7);
  });

  it("treats punctuation as a previous motion target for b and skips it for B", () => {
    expect(moveTitleCursorToPreviousWord("Fix API-client tests", 8)).toBe(7);
    expect(moveTitleCursorToPreviousWord("Fix API-client tests", 6)).toBe(4);
    expect(moveTitleCursorToPreviousWord("Fix API-client tests", 7, true)).toBe(4);
  });

  it("preserves only start or end cursor positions across keyboard ticket navigation", () => {
    expect(resolveNavigationTitleCursorIndex("First ticket", 0, "Second ticket")).toBe(0);
    expect(resolveNavigationTitleCursorIndex("First ticket", 11, "Second ticket")).toBe(12);
    expect(resolveNavigationTitleCursorIndex("First ticket", 4, "Second ticket")).toBe(0);
  });
});
