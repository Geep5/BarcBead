# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Project: Barc - Decentralized Page Chat

A Chrome extension that lets users chat with others viewing the same webpage using the Nostr protocol. Future roadmap includes WebRTC voice/video calls.

### Architecture Overview
- **Nostr Protocol**: Pure JS implementation (no dependencies) for relay communication
- **Channel System**: URLs are hashed to create unique channel IDs
- **Event Kinds**:
  - Kind 42: Channel messages (with `d` tag for channel ID)
  - Kind 10042: Presence announcements
- **Default Relays**: relay.damus.io, nos.lol, relay.primal.net

### Key Files
- `src/lib/nostr.js` - Core Nostr client with secp256k1 crypto
- `src/background.js` - Service worker managing connections
- `src/content.js` - Floating chat widget on pages
- `src/ui/popup.*` - Extension popup interface

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
bd list               # List all issues
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

