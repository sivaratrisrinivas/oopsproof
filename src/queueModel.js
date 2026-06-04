const SCAN_WINDOW_DAYS = 30;

export function buildQueuePosts({ posts = [], channels = [], now = new Date() } = {}) {
  const channelsById = new Map(channels.map((channel) => [channel.id, normalizeChannel(channel)]));
  const scanWindowEnd = new Date(now.getTime() + SCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  return posts
    .map((post) => normalizeQueuePost({ post, channelsById }))
    .filter((post) => isInScanWindow(post, now, scanWindowEnd))
    .sort((left, right) => String(left.dueAt ?? "").localeCompare(String(right.dueAt ?? "")));
}

function normalizeQueuePost({ post, channelsById }) {
  const channel = channelsById.get(post.channelId) ?? {};

  return {
    id: post.id,
    text: post.text ?? "",
    channelId: post.channelId ?? "",
    channelName: channel.name ?? "",
    service: channel.service ?? "",
    status: post.status ?? "scheduled",
    dueAt: post.dueAt ?? null,
    createdAt: post.createdAt ?? null,
  };
}

function normalizeChannel(channel) {
  return {
    id: channel.id,
    name: channel.name ?? "Unnamed Buffer Channel",
    service: channel.service ?? "",
  };
}

function isInScanWindow(post, now, scanWindowEnd) {
  const dueAt = new Date(post.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    return false;
  }

  return dueAt >= now && dueAt <= scanWindowEnd;
}
