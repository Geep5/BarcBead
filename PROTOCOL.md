# Barc Protocol Specification

## URL-Based Nostr Channels

Barc uses Nostr as the transport layer for decentralized chat, with **URLs as the coordination point**. Anyone viewing the same webpage can communicate through Nostr relays without any central server.

## Core Concept

The URL of a webpage becomes the "channel" identifier. All clients normalize URLs the same way, enabling interoperability.

## Protocol Details

### Event Kinds

| Kind | Purpose | Description |
|------|---------|-------------|
| `42` | Channel Message | NIP-28 public chat message |
| `10042` | Presence | Ephemeral presence announcement |

### URL Normalization

To ensure all clients derive the same channel ID from a URL:

```
Input:  "https://GitHub.com/anthropics/claude-code/#readme"
Output: "https://github.com/anthropics/claude-code"
```

**Rules:**
1. Lowercase the origin (scheme + host)
2. Keep the pathname as-is (case-sensitive for path)
3. Remove trailing slashes from pathname
4. Remove hash/fragment (`#...`)
5. Remove query parameters (`?...`) - *optional, may keep for stateful pages*

### Tagging Convention

Messages use the `r` tag (URL reference) with the **plaintext normalized URL**:

```json
{
  "kind": 42,
  "content": "Hello world!",
  "tags": [
    ["r", "https://github.com/anthropics/claude-code"]
  ],
  "pubkey": "...",
  "created_at": 1234567890,
  "id": "...",
  "sig": "..."
}
```

**Why `r` tag?**
- Already used in Nostr for URL references (NIP-25, NIP-65)
- Human-readable (not a hash)
- Discoverable - anyone can query for messages about a URL
- No coordination needed on hash algorithms

### Subscription Filters

To receive messages for a channel:

```json
{
  "kinds": [42],
  "#r": ["https://github.com/anthropics/claude-code"],
  "since": 1234567890,
  "limit": 50
}
```

### Presence Announcements

To show who's currently viewing a page:

```json
{
  "kind": 10042,
  "content": "{\"name\": \"alice\", \"action\": \"join\"}",
  "tags": [
    ["r", "https://github.com/anthropics/claude-code"]
  ]
}
```

## Interoperability

Any Nostr client can participate by:

1. **Normalizing the URL** using the rules above
2. **Publishing kind 42 events** with `["r", normalized_url]` tag
3. **Subscribing with `#r` filter** to receive messages

## Recommended Relays

```
wss://relay.damus.io
wss://nos.lol
wss://relay.primal.net
```

## Example Implementation

```javascript
function normalizeUrlForChannel(url) {
  const parsed = new URL(url);
  return parsed.origin.toLowerCase() +
         parsed.pathname.replace(/\/$/, '');
}

// Subscribe to a page's chat
const channelUrl = normalizeUrlForChannel(window.location.href);
relay.subscribe({
  kinds: [42],
  '#r': [channelUrl],
  since: Math.floor(Date.now() / 1000) - 86400
});

// Send a message
const event = {
  kind: 42,
  content: "Hello from this page!",
  tags: [['r', channelUrl]],
  created_at: Math.floor(Date.now() / 1000)
};
```

## Future Considerations

- **NIP Proposal**: Formalize this as a Nostr Implementation Possibility
- **Client Tag**: Add `["client", "barc"]` for client identification
- **Threading**: Use `e` tags to reply to specific messages
- **Moderation**: Community-based moderation via NIP-56 reports

## Version

Protocol Version: 1.0
Last Updated: December 2024
