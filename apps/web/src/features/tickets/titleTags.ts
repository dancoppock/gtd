const HASHTAG_PATTERN = /(^|\s)#([a-z0-9_-]+)/gi;

export function extractHashtagLabels(title: string) {
  return Array.from(
    new Set(
      Array.from(title.matchAll(HASHTAG_PATTERN))
        .map((match) => match[2]?.trim().toLowerCase())
        .filter((label): label is string => Boolean(label)),
    ),
  );
}

export function stripHashtagsFromTitle(title: string) {
  return title
    .replace(HASHTAG_PATTERN, (match, leadingWhitespace) => (leadingWhitespace ? " " : ""))
    .replace(/\s+/g, " ")
    .trim();
}
