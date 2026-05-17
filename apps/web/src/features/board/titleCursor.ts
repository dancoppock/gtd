function getCharacterKind(character: string, useWhitespaceWords: boolean) {
  if (/\s/.test(character)) {
    return "space";
  }

  if (useWhitespaceWords) {
    return "word";
  }

  return /[A-Za-z0-9_]/.test(character) ? "word" : "punctuation";
}

export function getLastTitleCursorIndex(title: string) {
  return Math.max(title.length - 1, 0);
}

export function clampTitleCursorIndex(title: string, cursorIndex: number) {
  return Math.min(Math.max(cursorIndex, 0), getLastTitleCursorIndex(title));
}

export function clampTitleInsertionIndex(title: string, cursorIndex: number) {
  return Math.min(Math.max(cursorIndex, 0), title.length);
}

export function resolveNavigationTitleCursorIndex(
  currentTitle: string,
  currentCursorIndex: number,
  nextTitle: string,
) {
  const clampedCursorIndex = clampTitleCursorIndex(currentTitle, currentCursorIndex);

  if (clampedCursorIndex === 0) {
    return 0;
  }

  if (clampedCursorIndex === getLastTitleCursorIndex(currentTitle)) {
    return getLastTitleCursorIndex(nextTitle);
  }

  return 0;
}

export function moveTitleCursorToNextWord(
  title: string,
  cursorIndex: number,
  useWhitespaceWords = false,
) {
  if (!title) {
    return 0;
  }

  const lastCursorIndex = getLastTitleCursorIndex(title);
  const clampedCursorIndex = clampTitleCursorIndex(title, cursorIndex);

  if (clampedCursorIndex >= lastCursorIndex) {
    return lastCursorIndex;
  }

  let nextCursorIndex = clampedCursorIndex + 1;
  const currentKind = getCharacterKind(title[clampedCursorIndex]!, useWhitespaceWords);

  if (currentKind !== "space") {
    while (
      nextCursorIndex < title.length &&
      getCharacterKind(title[nextCursorIndex]!, useWhitespaceWords) === currentKind
    ) {
      nextCursorIndex += 1;
    }
  }

  while (
    nextCursorIndex < title.length &&
    getCharacterKind(title[nextCursorIndex]!, useWhitespaceWords) === "space"
  ) {
    nextCursorIndex += 1;
  }

  return clampTitleCursorIndex(title, nextCursorIndex);
}

export function moveTitleCursorToPreviousWord(
  title: string,
  cursorIndex: number,
  useWhitespaceWords = false,
) {
  if (!title) {
    return 0;
  }

  const clampedCursorIndex = clampTitleCursorIndex(title, cursorIndex);

  if (clampedCursorIndex <= 0) {
    return 0;
  }

  let nextCursorIndex = clampedCursorIndex - 1;

  while (
    nextCursorIndex > 0 &&
    getCharacterKind(title[nextCursorIndex]!, useWhitespaceWords) === "space"
  ) {
    nextCursorIndex -= 1;
  }

  const targetKind = getCharacterKind(title[nextCursorIndex]!, useWhitespaceWords);

  while (
    nextCursorIndex > 0 &&
    getCharacterKind(title[nextCursorIndex - 1]!, useWhitespaceWords) === targetKind
  ) {
    nextCursorIndex -= 1;
  }

  return nextCursorIndex;
}
