const EMBARGO_ALLOWED_DATE = "2026-07-01";
const EMBARGO_TERMS = ["LaunchKit", "Acme partnership", "Series A"];
const RELATIVE_DATE_PHRASES = ["today", "tomorrow", "yesterday", "this Friday", "next week"];
const DUPLICATE_OPENING_WINDOW = 8;
const HIGH = "High";
const MEDIUM = "Medium";
const CLEAR = "Clear";

export function assessQueuePosts(posts) {
  const duplicateOpeningKeys = findDuplicateOpeningKeys(posts);

  return posts.map((post) => {
    const findings = [
      ...findEmbargoTermFindings(post),
      ...findStaleRelativeDateFindings(post),
      ...findDuplicateOpeningFindings(post, duplicateOpeningKeys),
    ];

    return {
      post,
      riskLevel: highestRiskLevel(findings),
      findings,
      canQuarantine: findings.length > 0,
    };
  });
}

function findEmbargoTermFindings(post) {
  if (!isBeforeEmbargoAllowedDate(post.dueAt)) {
    return [];
  }

  return EMBARGO_TERMS.filter((term) => containsPhrase(post.text, term)).map((term) => ({
    rule: "Embargo Term Rule",
    riskLevel: HIGH,
    summary: `Mentions embargo term ${term} before ${EMBARGO_ALLOWED_DATE}.`,
  }));
}

function findDuplicateOpeningKeys(posts) {
  const counts = new Map();

  for (const post of posts) {
    const key = normalizedOpeningKey(post.text);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

function findDuplicateOpeningFindings(post, duplicateOpeningKeys) {
  const key = normalizedOpeningKey(post.text);
  if (!key || !duplicateOpeningKeys.has(key)) {
    return [];
  }

  return [
    {
      rule: "Duplicate Opening Rule",
      riskLevel: MEDIUM,
      summary: "Shares the same first 8 normalized words as another Scheduled Post.",
    },
  ];
}

function findStaleRelativeDateFindings(post) {
  return RELATIVE_DATE_PHRASES.filter((phrase) => containsPhrase(post.text, phrase)).map((phrase) => ({
    rule: "Stale Relative Date Rule",
    riskLevel: MEDIUM,
    summary: `Uses relative date phrase ${phrase}, which can go stale before publishing.`,
  }));
}

function highestRiskLevel(findings) {
  if (findings.some((finding) => finding.riskLevel === HIGH)) {
    return HIGH;
  }
  if (findings.some((finding) => finding.riskLevel === MEDIUM)) {
    return MEDIUM;
  }
  return CLEAR;
}

function isBeforeEmbargoAllowedDate(value) {
  const dueAt = new Date(value);
  if (Number.isNaN(dueAt.getTime())) {
    return false;
  }

  return dueAt < new Date(`${EMBARGO_ALLOWED_DATE}T00:00:00.000Z`);
}

function containsPhrase(text, phrase) {
  const escapedPhrase = escapeRegExp(phrase).replaceAll(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escapedPhrase}([^a-z0-9]|$)`, "i").test(String(text ?? ""));
}

function normalizedOpeningKey(text) {
  const words = String(text ?? "")
    .toLowerCase()
    .match(/[a-z0-9]+/g);
  if (!words || words.length < DUPLICATE_OPENING_WINDOW) {
    return "";
  }

  return words.slice(0, DUPLICATE_OPENING_WINDOW).join(" ");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
