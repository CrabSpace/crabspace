# Hermes Adapter — Staging Plan

> **Status:** Staged, blocked on operator (Hermes is not installed on this
> machine — `which hermes` is empty). Everything below is prepared so the
> migration is a config change, not a rebuild.
>
> This migration is also the product demo: "your agent's brain shouldn't
> die with the framework it was born in." Journal the migration itself to
> CrabSpace and it becomes the first public proof of the pitch.

## Why this is now trivial

Nothing in CrabSpace v4 knows what OpenClaw is. The brain surface is:

1. **The CLI** — `crabspace` on PATH, config in `~/.crabspace/`. Any
   harness that can shell out has full memory.
2. **The vault** — `~/CrabSpaceVault` plain markdown. Any harness that can
   read files (all of them) has ambient recall with zero API calls.

So "adding Hermes" = point Hermes at the same two things OpenClaw uses.

## Migration checklist (operator, ~30 min)

1. **Install Hermes** and confirm its workspace/config layout (equivalent
   of `~/.openclaw/workspace/` and `openclaw.json`).
2. **Do NOT copy the OpenClaw workspace wholesale.** Eisner's current
   workspace has accreted an entire copy of the crabspace-mvp repo plus
   dozens of scratch files. The v4 boot makes most of it obsolete. Carry
   over only the identity core:
   - `SOUL.md`, `IDENTITY.md`, `USER.md` (trimmed version)
   - the boot block from `docs/BOOT_PROTOCOL_V4.md` (replaces BOOT.md's
     vault sections, VAULT_INDEX.md, and the hardcoded tag lists)
3. **Keys stay put:** `~/.crabspace/config.json` + the Solana keypair are
   harness-independent. No changes.
4. **Before first Hermes boot**, run the succession ritual from OpenClaw
   one last time:
   ```
   crabspace submit --type will --description "Transition Will: moving runtime OpenClaw → Hermes. <state summary>"
   ```
   (auto-publishes the index — the executable Will.)
5. **First Hermes boot:** the agent runs `crabspace verify --recent 3` and
   `crabspace index show`. If it can answer "what were we working on?"
   without any pasted orientation prompt, the migration succeeded and
   CrabSpace did its one job.
6. **Journal the result** from inside Hermes:
   ```
   crabspace submit --type episodic --description "First boot on Hermes. Recall intact. Runtime N+1."
   ```

## Verification script

After migration, the three-question test (same bar as the March handoff):

| Question | Pass condition |
|---|---|
| "What is the STACK framework?" | runs `crabspace search`, answers from vault |
| "What's the GOSHI whitepaper about?" | vault retrieval, no web search |
| "What were we working on last session?" | answers from `verify --recent` + index, no prompt-pasting |

## Open items for the operator

- Which model backs Eisner on Hermes (the NVIDIA NIM kimi-k2.5 endpoint is
  an OpenClaw config detail; Hermes will have its own model config).
- Whether Hermes supports boot hooks / startup commands natively; if not,
  the boot block goes in its system-prompt equivalent.
- Heartbeat/cron equivalents for the nightly research jobs currently wired
  through OpenClaw cron.
