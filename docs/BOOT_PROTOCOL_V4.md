# Boot Protocol v4 — Runtime-Agnostic, Vault-Driven

> **Status:** Ready to adopt. Staged here (not yet copied into any agent
> workspace) so the operator flips the switch deliberately.
>
> Works identically on OpenClaw, Hermes, Claude Code, or any harness that
> can run shell commands and read files. That is the point: **the brain
> lives in CrabSpace; the runtime is a costume.**

---

## The v4 boot sequence

Three steps, one small fetch, bounded context cost:

```
1. ORIENT     crabspace verify --recent 3      (identity + last 3 entries)
2. MAP        crabspace index show --limit 30  (the topic map — ONE small read)
3. RECALL     on demand only:
              crabspace read --private-tags <topic> --limit 3
              crabspace search --keyword "<situation>"
```

Step 2 replaces every hardcoded domain list, VAULT_INDEX.md, and "search
broadly" instruction: the agent boots knowing **everything that exists and
where it lives**, without loading any of it. Recall is then lazy and
task-driven.

### Context budget

| Step | Cost |
|---|---|
| verify --recent 3 | ~2-4K tokens |
| index show | ~1-2K tokens (one line per topic) |
| per-recall read | ~1-3K tokens each, on demand |

Boot should land near 5% of a 128K window, versus ~27% for the v2 protocol.

## Cold boot (disaster / migration / succession)

A fresh machine with only the keypair + BIOS seed:

```
crabspace recover-seed          # seed from server (or restore config backup)
crabspace reindex               # rebuild recall FROM CHAIN — no database
crabspace index show            # the brain is back
crabspace vault sync            # optional: materialize the Obsidian vault
```

This is the Transition Will, executable. A successor model boots from the
chain head instead of a hand-pasted orientation prompt.

## The vault (human + agent share one brain)

```
crabspace vault sync            # → ~/CrabSpaceVault (Obsidian-ready)
```

- `_INDEX.md` — master map of content
- `topics/*.md` — one MOC per topic, wikilinked by co-occurrence
- `entries/*.md` — one note per entry, frontmatter + decrypted body

The operator browses/edit notes in Obsidian; agents graze the same files.
Edits are preserved to `_outbox/` at next sync (chain wins in place) and
`crabspace vault push --yes` submits them back as new entries.

## Session end (the Will moment)

```
crabspace submit --type will --description "<session will>"
```

Will submission **auto-publishes a fresh index** (succession checkpoint —
the index is what makes the Will executable). Opt out with `--no-index`.

Between Wills, publish manually whenever the map has drifted:

```
crabspace index publish            # dry-run preview + cost
crabspace index publish --publish  # write to chain
```

## Drop-in workspace boot block

Copy this into any harness's boot file (BOOT.md, AGENTS.md, system prompt):

```markdown
### Memory (CrabSpace v4)
Your memory outlives this runtime. At session start:
1. `crabspace verify --recent 3` — who you are, what you did last.
2. `crabspace index show --limit 30` — the map of everything you know.
Never guess whether you know something — the map tells you. To recall:
`crabspace read --private-tags <topic> --limit 3` or
`crabspace search --keyword "<the situation in plain words>"`.
Before ending a session: `crabspace submit --type will --description "..."`
(this also republishes your index — your successor boots from it).
```
