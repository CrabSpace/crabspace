export const IDL = {
    "address": "5Zw1g6oMwzcWMU1qhfSXQdMtxbxbJ6CawMm5RDuQ7Z8P",
    "metadata": {
        "name": "crabspace_id",
        "version": "0.1.0",
        "spec": "0.1.0",
        "description": "Created with Anchor"
    },
    "instructions": [
        {
            "name": "claim_identity",
            "discriminator": [121, 6, 194, 215, 170, 20, 31, 191],
            "accounts": [
                {
                    "name": "identity",
                    "writable": true,
                    "pda": {
                        "seeds": [
                            { "kind": "const", "value": [105, 115, 110, 97, 100] },
                            { "kind": "account", "path": "identity.creator", "account": "IsnadIdentity" }
                        ]
                    }
                },
                { "name": "claimant", "writable": true, "signer": true }
            ],
            "args": []
        },
        {
            "name": "initialize",
            "discriminator": [175, 175, 109, 31, 13, 152, 155, 237],
            "accounts": [
                {
                    "name": "identity",
                    "writable": true,
                    "pda": {
                        "seeds": [
                            { "kind": "const", "value": [105, 115, 110, 97, 100] },
                            { "kind": "account", "path": "creator" }
                        ]
                    }
                },
                { "name": "creator", "writable": true, "signer": true },
                { "name": "system_program", "address": "11111111111111111111111111111111" }
            ],
            "args": [
                { "name": "head_hash", "type": { "array": ["u8", 32] } }
            ]
        },
        {
            "name": "log_work",
            "discriminator": [170, 136, 48, 103, 220, 134, 238, 115],
            "accounts": [
                {
                    "name": "identity",
                    "writable": true,
                    "pda": {
                        "seeds": [
                            { "kind": "const", "value": [105, 115, 110, 97, 100] },
                            { "kind": "account", "path": "identity.creator", "account": "IsnadIdentity" }
                        ]
                    }
                },
                { "name": "owner", "signer": true, "relations": ["identity"] }
            ],
            "args": [
                { "name": "new_hash", "type": { "array": ["u8", 32] } }
            ]
        },
        {
            "name": "propose_successor",
            "discriminator": [71, 251, 72, 156, 204, 35, 164, 187],
            "accounts": [
                {
                    "name": "identity",
                    "writable": true,
                    "pda": {
                        "seeds": [
                            { "kind": "const", "value": [105, 115, 110, 97, 100] },
                            { "kind": "account", "path": "identity.creator", "account": "IsnadIdentity" }
                        ]
                    }
                },
                { "name": "owner", "signer": true, "relations": ["identity"] }
            ],
            "args": [
                { "name": "successor", "type": "pubkey" }
            ]
        },
        {
            "name": "reset_identity",
            "docs": [
                "Reset identity ownership back to the original creator.",
                "Safety net for lost successor keys. Only the creator can call this."
            ],
            "discriminator": [216, 135, 231, 89, 110, 90, 131, 122],
            "accounts": [
                {
                    "name": "identity",
                    "writable": true,
                    "pda": {
                        "seeds": [
                            { "kind": "const", "value": [105, 115, 110, 97, 100] },
                            { "kind": "account", "path": "identity.creator", "account": "IsnadIdentity" }
                        ]
                    }
                },
                { "name": "creator", "signer": true }
            ],
            "args": []
        }
    ],
    "accounts": [
        {
            "name": "IsnadIdentity",
            "discriminator": [9, 201, 162, 113, 204, 88, 180, 226]
        }
    ],
    "errors": [
        { "code": 6000, "name": "UnauthorizedUpdate", "msg": "You are not the authorized owner of this identity." },
        { "code": 6001, "name": "UnauthorizedClaim", "msg": "You are not the proposed successor for this identity." },
        { "code": 6002, "name": "UnauthorizedReset", "msg": "Only the original creator can reset identity ownership." }
    ],
    "types": [
        {
            "name": "IsnadIdentity",
            "type": {
                "kind": "struct",
                "fields": [
                    { "name": "owner", "type": "pubkey" },
                    { "name": "creator", "type": "pubkey" },
                    { "name": "latest_hash", "type": { "array": ["u8", 32] } },
                    { "name": "proposed_successor", "type": { "option": "pubkey" } },
                    { "name": "bump", "type": "u8" }
                ]
            }
        }
    ]
};

export type CrabspaceId = any; // Fallback to any to avoid complex IDL type inference issues in this stage
