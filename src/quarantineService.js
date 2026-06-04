const QUARANTINE_SUCCESS_MESSAGE = "Safe draft created. Remove the original scheduled post in Buffer.";
const SAFE_DRAFT_PREFIX = "Needs review before publishing: ";
const SAFE_DRAFT_ORIGINAL_LENGTH = 80;

export async function createSafeDraftReplacement({ post, createDraftPost }) {
  let draft;
  try {
    draft = await createDraftPost({
      channelId: post.channelId,
      text: `${SAFE_DRAFT_PREFIX}${String(post.text ?? "").slice(0, SAFE_DRAFT_ORIGINAL_LENGTH)}`,
    });
  } catch (error) {
    return {
      kind: "failed",
      message: "Failed Quarantine",
      detail: error.message || "Buffer draft creation failed.",
    };
  }

  return {
    kind: "success",
    draftPostId: draft.id,
    message: QUARANTINE_SUCCESS_MESSAGE,
  };
}
