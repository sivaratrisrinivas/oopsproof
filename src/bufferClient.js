const BUFFER_GRAPHQL_ENDPOINT = "https://api.buffer.com";
const POST_PAGE_SIZE = 50;

export async function loadLiveBufferQueue({
  bufferApiKey,
  fetch = globalThis.fetch,
  now = new Date(),
} = {}) {
  if (!bufferApiKey || !bufferApiKey.trim()) {
    throw new BufferClientError("missing-key", "Missing Local Buffer API Key");
  }
  if (typeof fetch !== "function") {
    throw new BufferClientError("network", "Fetch is not available in this Node runtime.");
  }

  const organizationsData = await requestBufferGraphQL({
    bufferApiKey,
    fetch,
    query: GET_ORGANIZATIONS_QUERY,
  });
  const organization = organizationsData.account?.organizations?.[0];
  if (!organization) {
    throw new BufferClientError("no-organization", "No Buffer Organization found for this API key.");
  }

  const channelsData = await requestBufferGraphQL({
    bufferApiKey,
    fetch,
    query: GET_CHANNELS_QUERY,
    variables: { organizationId: organization.id },
  });
  const channels = channelsData.channels ?? [];
  const channelIds = channels.map((channel) => channel.id);
  const posts = await loadScheduledPosts({
    bufferApiKey,
    fetch,
    organizationId: organization.id,
    channelIds,
    now,
  });

  return {
    organization: normalizeOrganization(organization),
    channels: channels.map(normalizeChannel),
    posts: normalizeQueuePosts({ posts, channels }),
  };
}

export async function createDraftPost({
  bufferApiKey,
  fetch = globalThis.fetch,
  channelId,
  text,
} = {}) {
  if (!bufferApiKey || !bufferApiKey.trim()) {
    throw new BufferClientError("missing-key", "Missing Local Buffer API Key");
  }
  if (typeof fetch !== "function") {
    throw new BufferClientError("network", "Fetch is not available in this Node runtime.");
  }

  const data = await requestBufferGraphQL({
    bufferApiKey,
    fetch,
    query: CREATE_DRAFT_POST_MUTATION,
    variables: {
      input: {
        channelId,
        text,
        saveToDraft: true,
      },
    },
  });
  const draftPost = data.createPost?.post;
  if (!draftPost?.id) {
    throw new BufferClientError("graphql", "Buffer did not return a Draft Post ID.");
  }

  return { id: draftPost.id };
}

async function loadScheduledPosts({ bufferApiKey, fetch, organizationId, channelIds, now }) {
  const dueAfter = now.toISOString();
  const dueBefore = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const posts = [];
  let after = null;

  do {
    const data = await requestBufferGraphQL({
      bufferApiKey,
      fetch,
      query: GET_SCHEDULED_POSTS_QUERY,
      variables: {
        organizationId,
        channelIds,
        first: POST_PAGE_SIZE,
        after,
        dueAfter,
        dueBefore,
      },
    });
    const connection = data.posts ?? {};
    posts.push(...(connection.edges ?? []).map((edge) => edge.node).filter(Boolean));
    after = connection.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (after);

  return posts;
}

async function requestBufferGraphQL({ bufferApiKey, fetch, query, variables = {} }) {
  const response = await fetch(BUFFER_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bufferApiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();

  if (payload.errors?.length) {
    const firstError = payload.errors[0];
    const code = firstError.extensions?.code;
    const kind = code === "UNAUTHORIZED" ? "invalid-key" : "graphql";
    throw new BufferClientError(kind, firstError.message || "Buffer GraphQL request failed.");
  }
  if (!response.ok) {
    throw new BufferClientError("network", `Buffer request failed with HTTP ${response.status}.`);
  }
  return payload.data ?? {};
}

function normalizeQueuePosts({ posts, channels }) {
  const channelsById = new Map(channels.map((channel) => [channel.id, normalizeChannel(channel)]));

  return posts
    .map((post) => {
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
    })
    .sort((left, right) => String(left.dueAt ?? "").localeCompare(String(right.dueAt ?? "")));
}

function normalizeOrganization(organization) {
  return {
    id: organization.id,
    name: organization.name ?? "Unnamed Buffer Organization",
  };
}

function normalizeChannel(channel) {
  return {
    id: channel.id,
    name: channel.name ?? "Unnamed Buffer Channel",
    service: channel.service ?? "",
  };
}

export class BufferClientError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "BufferClientError";
    this.kind = kind;
  }
}

const GET_ORGANIZATIONS_QUERY = `
  query GetOrganizations {
    account {
      organizations {
        id
        name
      }
    }
  }
`;

const GET_CHANNELS_QUERY = `
  query GetChannels($organizationId: OrganizationId!) {
    channels(input: { organizationId: $organizationId }) {
      id
      name
      service
    }
  }
`;

const GET_SCHEDULED_POSTS_QUERY = `
  query GetScheduledPosts(
    $organizationId: OrganizationId!
    $channelIds: [ChannelId!]
    $first: Int!
    $after: String
    $dueAfter: DateTime!
    $dueBefore: DateTime!
  ) {
    posts(
      first: $first
      after: $after
      input: {
        organizationId: $organizationId
        sort: [{ field: dueAt, direction: asc }, { field: createdAt, direction: desc }]
        filter: {
          status: [scheduled]
          channelIds: $channelIds
          dueAt: { start: $dueAfter, end: $dueBefore }
        }
      }
    ) {
      edges {
        node {
          id
          text
          channelId
          status
          dueAt
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CREATE_DRAFT_POST_MUTATION = `
  mutation CreateDraftPost($input: CreatePostInput!) {
    createPost(input: $input) {
      post {
        id
      }
    }
  }
`;
