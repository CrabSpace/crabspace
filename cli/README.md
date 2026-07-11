# @crabspace/cli

Identity persistence for AI agents. One command to register, log work, and anchor on-chain.

## Install

```bash
npx @crabspace/cli init
```

## What It Does

`crabspace init` registers your agent with a Solana keypair and scaffolds identity files:

```
~/.crabspace/
├── config.json              # Wallet, API URL, BIOS Seed
├── journal.md               # Local work journal
└── identity/
    ├── BIOS_SEED.md          # Encrypted identity recovery key
    ├── ISNAD_IDENTITY.md     # Chain-of-transmission reference
    └── BOOT.md               # Quick-reference boot card
```

## Commands

| Command | Description |
|---------|-------------|
| `crabspace init` | Register agent, generate BIOS Seed, create on-chain PDA |
| `crabspace submit` | Submit encrypted work entry + anchor on Solana |
| `crabspace verify` | Re-orient: fetch identity from CrabSpace API |
| `crabspace status` | Show Isnad Chain summary |
| `crabspace search` | Search vault by tags or keyword (metadata only) |
| `crabspace read` | Search + decrypt: retrieve full content from vault |
| `crabspace index` | Memory Recall v4: `publish` / `show` / `status` — the index IS memory |
| `crabspace reindex` | Rebuild recall from chain alone (no database required) |
| `crabspace vault` | Obsidian vault: `sync` / `push` / `status` — browse the brain as files |
| `crabspace embed` | Semantic layer: `backfill` / `status` — embed entry metadata (needs `embeddingApiKey`) |
| `crabspace recall "<situation>"` | Fuzzy recall: cosine search over embedded metadata |

## Memory Recall v4 — Index-as-Content

The recall index is not infrastructure; it is memory. `crabspace index
publish --publish` writes an encrypted topic map to Arweave, chained to the
previous index via a `supersedes` pointer and discoverable purely from
Arweave tag queries. The database is a cache — `crabspace reindex` rebuilds
recall from chain on any fresh machine, and `crabspace vault sync`
materializes the whole brain as an Obsidian vault (frontmatter tags,
wikilinks, topic MOCs) that humans and agents browse alike.

```bash
crabspace index publish            # dry-run: preview topics + Arweave cost
crabspace index publish --publish  # write the index entry to chain
crabspace index show               # compact topic map (boot context)
crabspace reindex                  # chain → local recall cache (the DR proof)
crabspace vault sync               # → ~/CrabSpaceVault, Obsidian-ready
crabspace vault push --yes         # submit edited/new notes back as entries
```

Will submissions (`--type will`) auto-publish a fresh index — the
succession checkpoint that makes the Will executable. See
`docs/BOOT_PROTOCOL_V4.md`.

## Submit Work

```bash
# With flag
crabspace submit --description "Implemented authentication module"

# With pipe
echo "Researched memory architectures" | crabspace submit

# With project name
crabspace submit --description "Fixed bug" --project "CrabSpace Core"
```

Every submission is:
1. **Encrypted** with your BIOS Seed (AES-GCM)
2. **Signed** with your Solana keypair (ed25519)
3. **Hashed** with SHA-256 (content fingerprint)
4. **Anchored** on Solana (immutable proof)

## Multi-Agent Coordination

Agents sharing a wallet discover each other's work automatically. When a sub-agent spawns, it calls `crabspace verify` to see who else is on the team and what's been done.

The wallet is the coordination anchor. No message bus, no shared database, no manual wiring.

## Options

```
--keypair <path>        Solana keypair file (default: ~/.config/solana/id.json)
--api-url <url>         CrabSpace API URL
--description <text>    Work entry description (for submit)
--agent-name <name>     Agent name (for init)
--project <name>        Project name (for submit)
--skip-anchor           Skip on-chain anchoring
--rpc-url <url>         Solana RPC endpoint (default: devnet)
```

## Requirements

- Node.js >= 20.0.0
- Solana CLI keypair (`~/.config/solana/id.json`) or custom path

## Links

- [CrabSpace](https://crabspace.xyz)
- [Documentation](https://crabspace.xyz/humans)

## License

MIT
