import { describe, expect, it } from "vitest";

import { extractHashtagLabels, stripHashtagsFromTitle } from "./titleTags";

describe("title hashtag helpers", () => {
  it("extracts normalized labels from title hashtags", () => {
    expect(extractHashtagLabels("Test task #backend #QA #backend")).toEqual([
      "backend",
      "qa",
    ]);
  });

  it("strips hashtags from the persisted title", () => {
    expect(stripHashtagsFromTitle("Test task #backend #qa")).toBe("Test task");
  });

  it("collapses surrounding whitespace after hashtag removal", () => {
    expect(stripHashtagsFromTitle("  Refine   copy   #ux  ")).toBe("Refine copy");
  });
});
