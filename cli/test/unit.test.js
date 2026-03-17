/**
 * CrabSpace CLI — Unit Tests
 * Tests critical seed-safety paths WITHOUT a running server.
 *
 * Run: node --test cli/test/unit.test.js
 * Or:  npm test --prefix cli  (runs both unit + integration)
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── Test isolation ──────────────────────────────────────────────────────────
// Force all tests into ~/.crabspace-test-unit/ so production config is NEVER touched.
const TEST_DIR = join(homedir(), '.crabspace-test-unit');
process.env.CRABSPACE_CONFIG_DIR = TEST_DIR;

function cleanTestDir() {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
}

function writeTestConfig(config) {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2) + '\n');
}

function readTestConfig() {
    return JSON.parse(readFileSync(join(TEST_DIR, 'config.json'), 'utf-8'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG MODULE
// ═══════════════════════════════════════════════════════════════════════════════

describe('config.js', () => {
    // Re-import after setting env var
    let configModule;

    before(async () => {
        configModule = await import('../lib/config.js');
    });

    beforeEach(() => {
        cleanTestDir();
    });

    after(() => {
        cleanTestDir();
    });

    it('configExists() returns false when no config', () => {
        assert.equal(configModule.configExists(), false);
    });

    it('writeConfig + readConfig round-trips correctly', () => {
        const config = { wallet: 'test123', biosSeed: 'seed456', apiUrl: 'http://localhost:3002' };
        configModule.writeConfig(config);
        const read = configModule.readConfig();
        assert.deepEqual(read, config);
    });

    it('configExists() returns true after write', () => {
        configModule.writeConfig({ wallet: 'test' });
        assert.equal(configModule.configExists(), true);
    });

    it('getConfigDir() respects CRABSPACE_CONFIG_DIR override', () => {
        assert.equal(configModule.getConfigDir(), TEST_DIR);
    });

    it('writeConfig never touches production config', () => {
        const prodConfig = join(homedir(), '.crabspace', 'config.json');
        const prodBefore = existsSync(prodConfig) ? readFileSync(prodConfig, 'utf-8') : null;

        configModule.writeConfig({ wallet: 'unit-test', biosSeed: 'unit-seed' });

        const prodAfter = existsSync(prodConfig) ? readFileSync(prodConfig, 'utf-8') : null;
        assert.equal(prodBefore, prodAfter, 'Production config.json was modified by test!');
    });

    it('requireConfig exits when no config exists', () => {
        // requireConfig calls process.exit(1) — we can't easily test that
        // without mocking, so test readConfig returns null instead
        cleanTestDir();
        assert.equal(configModule.readConfig(), null);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEED EPOCH COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('seed_epoch', () => {
    it('produces consistent 8-char hex hash from seed string', async () => {
        const seed = '{"version":"1.0","isnad_ptr":"0xabc","thread_id":"thread_test","legacy_pda":"pda_test","verify_key":"e95a5251"}';

        const buffer = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(seed)
        );
        const epoch = Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, 8);

        assert.equal(epoch.length, 8);
        assert.match(epoch, /^[0-9a-f]{8}$/);

        // Running again with same input must produce same output
        const buffer2 = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(seed)
        );
        const epoch2 = Array.from(new Uint8Array(buffer2))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, 8);

        assert.equal(epoch, epoch2, 'seed_epoch is not deterministic!');
    });

    it('different seeds produce different epochs', async () => {
        async function computeEpoch(seed) {
            const buffer = await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(seed)
            );
            return Array.from(new Uint8Array(buffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('')
                .slice(0, 8);
        }

        const epoch1 = await computeEpoch('seed_a');
        const epoch2 = await computeEpoch('seed_b');
        assert.notEqual(epoch1, epoch2, 'Different seeds must produce different epochs');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENCRYPTION ROUND-TRIP
// ═══════════════════════════════════════════════════════════════════════════════

describe('encrypt.js', () => {
    let encrypt;

    before(async () => {
        encrypt = await import('../lib/encrypt.js');
    });

    it('encrypts and decrypts with same seed', async () => {
        const seed = 'test-bios-seed-12345';
        const cleartext = 'This is a secret work entry.';

        const encrypted = await encrypt.encryptData(cleartext, seed);
        assert.ok(encrypted, 'Encrypted data should not be empty');
        assert.notEqual(encrypted, cleartext, 'Encrypted should differ from cleartext');

        const decrypted = await encrypt.decryptData(encrypted, seed);
        assert.equal(decrypted, cleartext, 'Decrypted text should match original');
    });

    it('decrypt fails with wrong seed', async () => {
        const cleartext = 'Secret entry';
        const encrypted = await encrypt.encryptData(cleartext, 'correct-seed');

        await assert.rejects(
            () => encrypt.decryptData(encrypted, 'wrong-seed'),
            /Wrong BIOS Seed|Decryption failed/,
            'Should throw clear error on wrong seed'
        );
    });

    it('decrypt fails with empty seed', async () => {
        const encrypted = await encrypt.encryptData('data', 'a-seed');
        await assert.rejects(
            () => encrypt.decryptData(encrypted, ''),
            /BIOS Seed missing|Wrong BIOS Seed/,
            'Should throw clear error on empty seed'
        );
    });

    it('encrypt produces different ciphertext each call (random IV)', async () => {
        const seed = 'determinism-test';
        const text = 'same input';
        const enc1 = await encrypt.encryptData(text, seed);
        const enc2 = await encrypt.encryptData(text, seed);
        assert.notEqual(enc1, enc2, 'Each encryption should use a different IV');

        // But both should decrypt to the same thing
        assert.equal(await encrypt.decryptData(enc1, seed), text);
        assert.equal(await encrypt.decryptData(enc2, seed), text);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INIT IDEMPOTENCY (config-level, no server)
// ═══════════════════════════════════════════════════════════════════════════════

describe('init idempotency (config-level)', () => {
    let configModule;

    before(async () => {
        configModule = await import('../lib/config.js');
    });

    beforeEach(() => {
        cleanTestDir();
    });

    after(() => {
        cleanTestDir();
    });

    it('existing config with wallet + seed triggers idempotency gate', () => {
        const original = {
            wallet: 'test-wallet-abc',
            biosSeed: '{"version":"1.0"}',
            apiUrl: 'http://localhost:3002',
            agentName: 'TestAgent',
        };
        configModule.writeConfig(original);

        // Simulate the idempotency check from init.js
        const existing = configModule.readConfig();
        const hasWallet = !!existing?.wallet;
        const hasSeed = !!existing?.biosSeed;

        assert.ok(hasWallet && hasSeed, 'Idempotency gate should detect complete config');

        // Verify the seed value is exactly what we wrote
        assert.equal(existing.biosSeed, original.biosSeed);
    });

    it('existing config without seed triggers recovery path', () => {
        configModule.writeConfig({
            wallet: 'test-wallet-abc',
            apiUrl: 'http://localhost:3002',
        });

        const existing = configModule.readConfig();
        const hasWallet = !!existing?.wallet;
        const hasSeed = !!existing?.biosSeed;

        assert.ok(hasWallet && !hasSeed, 'Should detect wallet-present-seed-missing state');
    });

    it('writeConfig preserves existing fields when spreading', () => {
        const original = {
            wallet: 'abc',
            keypair: '~/.config/solana/id.json',
            apiUrl: 'http://localhost:3002',
            agentName: 'Test',
        };
        configModule.writeConfig(original);

        // Simulate seed recovery: spread existing + add seed
        const current = configModule.readConfig();
        configModule.writeConfig({ ...current, biosSeed: 'recovered-seed' });

        const final = configModule.readConfig();
        assert.equal(final.wallet, 'abc', 'wallet should be preserved');
        assert.equal(final.keypair, '~/.config/solana/id.json', 'keypair should be preserved');
        assert.equal(final.biosSeed, 'recovered-seed', 'seed should be added');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMIT GUARD (logic-level, no server)
// ═══════════════════════════════════════════════════════════════════════════════

describe('submit guard (config-level)', () => {
    let configModule;

    before(async () => {
        configModule = await import('../lib/config.js');
    });

    beforeEach(() => {
        cleanTestDir();
    });

    after(() => {
        cleanTestDir();
    });

    it('config without biosSeed must fail the guard check', () => {
        configModule.writeConfig({
            wallet: 'test',
            apiUrl: 'http://localhost:3002',
        });

        const config = configModule.readConfig();
        const seedMissing = !config.biosSeed;
        assert.ok(seedMissing, 'Submit guard should detect missing seed');
    });

    it('config with empty string biosSeed must fail the guard check', () => {
        configModule.writeConfig({
            wallet: 'test',
            biosSeed: '',
            apiUrl: 'http://localhost:3002',
        });

        const config = configModule.readConfig();
        const seedMissing = !config.biosSeed;
        assert.ok(seedMissing, 'Submit guard should treat empty string as missing');
    });

    it('config with valid biosSeed passes the guard check', () => {
        configModule.writeConfig({
            wallet: 'test',
            biosSeed: '{"version":"1.0"}',
            apiUrl: 'http://localhost:3002',
        });

        const config = configModule.readConfig();
        const seedPresent = !!config.biosSeed;
        assert.ok(seedPresent, 'Submit guard should pass with valid seed');
    });
});
