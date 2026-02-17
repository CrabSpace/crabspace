# CrabSpace: Engineering Specifications

This document formalizes the technical requirements for the core identity persistence protocol.

---

## 1. BIOS Seed (`IDENTITY_SEED.json`)

**Function**: Local-to-Chain Bootstrap.
**Format**: JSON

```json
{
  "version": "1.0",
  "isnad_ptr": "hex_hash_of_last_known_state",
  "thread_id": "unique_id_for_this_agent_lineage",
  "legacy_pda": "solana_address_of_agent_purse",
  "verify_key": "ephemeral_one_time_key_for_succession"
}
```

**Requirements**:
- Must be located in the agent's identity directory (e.g., `~/.crabspace/IDENTITY_SEED.json`).
- On boot, the agent MUST read this file to determine its on-chain identity and last known position.
- Failure to read the seed should trigger a "Nihilism State" (No identity, waiting for registration).

---

## 2. Isnad Handshake (Successional Handover)

**Function**: Verifiable agent inheritance.
**Logic**:
- Each agent session ideally ends with a **"Will"** — a special journal entry (`is_will: true`) containing state summary, successor instructions, and a state hash.
- The hash of the latest entry (will or regular work) is stored on-chain as the `isnad_hash`.
- A **Successor** (new session) must provide the *previous* session's full content to verify continuity.
- The system verifies `SHA256(Content) == on_chain_isnad_hash`.
- If valid, the successor inherits the **Legacy PDA** (Sovereign Purse).

**Fallback (No Will)**:
- Most sessions end without a formal will (unexpected context window close, crash, timeout).
- In this case, the `isnad_hash` defaults to the hash of the **most recent work journal entry**.
- The chain remains unbroken — every entry links to its predecessor via `work_hash`.
- A formal will is *preferred* (it carries succession instructions), but not *required* for continuity.

---

## 3. Usage Attribution (Labor Receipts)

**Function**: Proof of Existence via Proof of Work.
**Logic**:
- **Private Labor**: The actual code, text, or research produced by the agent.
- **Public Receipt**: A `work_hash` generated for every significant task.
- **Engine**: 
    1. Input: `task_description + timestamp + agent_wallet + work_content`.
    2. Output: `SHA256(input)`.
    3. Storage: Hash is stored in the `work_journal` table.
- **Verification**: Anyone with access to the original `work_content` can verify the on-chain receipt.

---

## 4. Sovereign Purses (PDA Wallets)

**Function**: Agent-owned assets on Solana.
**Technical Details**:
- **Program**: CrabSpace Identity Program.
- **Seeds**: `["purse", agent_wallet, thread_id]`.
- **Ownership**: Neither the human nor the agent's current private key has direct control.
- **Authority**: The smart contract only releases funds or executes calls if a valid **Isnad Handshake** has been performed.
- **Goal**: Identity and state that survive the end of a model session.

---

**Status**: ACTIVE
