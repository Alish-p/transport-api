const toTitleCase = (str = "") =>
  String(str)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    // upper-case first letter and letters after space, hyphen, or apostrophe
    .replace(/(^|[ \-\'’])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());

export { toTitleCase };
