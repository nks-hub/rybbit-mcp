// A result is sent twice, as text and as structuredContent, and remote clients
// cut tool output at roughly 35 000 characters in total.
export const CHARACTER_LIMIT = 16000;
export const REQUEST_TIMEOUT_MS = 30000;
export const MAX_PAGE_SIZE = 200;
