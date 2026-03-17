/**
 * CrabSpace CLI — Integration Tests
 * Tests full command flows against a running CrabSpace dev server.
 *
 * Prerequisites:
 *   1. Dev server running: npm run dev (in crabspace-mvp/)
 *   2. Solana keypair at default path: ~/.config/solana/id.json
 *   3. Agent already registered for that keypair's wallet
 *
 * Run: node --test cli/test/integration.test.js
 *
 * These tests use CRABSPACE_CONFIG_DIR to isolate all config writes
 * to a temp directory. Production config is NEVER touched.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── Test isolation ──────────────────────────────────────────────────────────
const TEST_DIR = join(homedir(), '.crabspace-test-integration');
const CLI_DIR = join(import.meta.dirname, '..');
const API_URL = process.env.TEST_API_URL || 'http://localhost:3002';

function cleanTestDir() {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
}

function readTestConfig() {
    const configPath = join(TEST_DIR, 'config.json');
    if (!existsSync(configPath)) return null;
    return JSON.parse(readFileSync(configPath, 'utf-8'));
}

function writeTestConfig(config) {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2) + '\n');
}

/**
 * Run a CLI command in the test environment.
 * Returns { stdout, exitCode }.
 */
function runCLI(command, { expectFail = false } = {}) {
    const env = {
        ...process.env,
        CRABSPACE_CONFIG_DIR: TEST_DIR,
    };
    try {
        const stdout = execSync(
            `node ${join(CLI_DIR, 'index.js')} ${command}`,
            { cwd: CLI_DIR, env, encoding: 'utf-8', timeout: 15000 }
        );
        return { stdout, exitCode: 0 };
    } catch (err) {
        if (expectFail) {
            return { stdout: (err.stdout || '') + (err.stderr || ''), exitCode: err.status || 1 };
        }
        throw new Error(`CLI command failed unexpectedly: ${command}\n${err.stdout}\n${err.stderr}`);
    }
}

/**
 * Check if the dev server is reachable before running any tests.
 */
async function checkServer() {
    try {
        const res = await fetch(`${API_URL}/api/verify?wallet=test`, { signal: AbortSignal.timeout(3000) });
        return res.status !== 0;
    } catch {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER CHECK
// ═══════════════════════════════════════════════════════════════════════════════

describe('integration: prerequisites', () => {
    it('dev server is reachable', async () => {
        const ok = await checkServer();
        if (!ok) {
            console.error(`\n  ⚠️  Dev server not reachable at ${API_URL}`);
            console.error('  Start it first: npm run dev (in crabspace-mvp/)');
            console.error('  Or set TEST_API_URL env var.\n');
        }
        assert.ok(ok, `Dev server must be running at ${API_URL}`);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INIT + IDEMPOTENCY
// ═══════════════════════════════════════════════════════════════════════════════

describe('integration: init', () => {
    before(() => {
        cleanTestDir();
    });

    after(() => {
        cleanTestDir();
    });

    it('fresh init creates config with wallet and biosSeed', () => {
        const { stdout } = runCLI(`init --agent-name IntegrationTest --api-url ${API_URL} --skip-email`);
        assert.match(stdout, /registered|Config saved/i, 'Should report success');

        const config = readTestConfig();
        assert.ok(config, 'Config file should exist');
        assert.ok(config.wallet, 'Config should have wallet');
        assert.ok(config.biosSeed, 'Config should have biosSeed');
        assert.ok(config.biosSeed.length > 10, 'biosSeed should be substantive');
    });

    it('re-running init preserves existing seed (idempotency)', () => {
        const configBefore = readTestConfig();
        const seedBefore = configBefore.biosSeed;
        const walletBefore = configBefore.wallet;

        const { stdout } = runCLI(`init --agent-name IntegrationTest --api-url ${API_URL} --skip-email`);
        assert.match(stdout, /Identity.*preserved|Identity found/i, 'Should say identity preserved');

        const configAfter = readTestConfig();
        assert.equal(configAfter.biosSeed, seedBefore, 'biosSeed MUST NOT change on re-init');
        assert.equal(configAfter.wallet, walletBefore, 'wallet MUST NOT change on re-init');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMIT GUARD
// ═══════════════════════════════════════════════════════════════════════════════

describe('integration: submit guard', () => {
    before(() => {
        cleanTestDir();
        // Create config WITH wallet but WITHOUT seed
        runCLI(`init --agent-name IntegrationTest --api-url ${API_URL} --skip-email`);
        // Strip seed
        const config = readTestConfig();
        delete config.biosSeed;
        writeTestConfig(config);
    });

    after(() => {
        cleanTestDir();
    });

    it('submit blocks when biosSeed is missing', () => {
        const { stdout, exitCode } = runCLI(
            `submit --description "test" --api-url ${API_URL} --skip-anchor`,
            { expectFail: true }
        );
        assert.notEqual(exitCode, 0, 'Should exit with non-zero code');
        assert.match(stdout, /BIOS SEED MISSING/i, 'Should print seed missing error');
        assert.match(stdout, /recover-seed/, 'Should suggest recover-seed command');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFY AUTO-SAVE
// ═══════════════════════════════════════════════════════════════════════════════

describe('integration: verify auto-save', () => {
    before(() => {
        cleanTestDir();
        // Create full config, then strip seed
        runCLI(`init --agent-name IntegrationTest --api-url ${API_URL} --skip-email`);
        const config = readTestConfig();
        delete config.biosSeed;
        writeTestConfig(config);
    });

    after(() => {
        cleanTestDir();
    });

    it('verify auto-saves biosSeed when missing from config', () => {
        const configBefore = readTestConfig();
        assert.ok(!configBefore.biosSeed, 'Precondition: seed should be missing');

        const { stdout } = runCLI(`verify --api-url ${API_URL}`);
        assert.match(stdout, /BIOS seed recovered|seed.*saved/i, 'Should report seed recovery');

        const configAfter = readTestConfig();
        assert.ok(configAfter.biosSeed, 'biosSeed should be present after verify');
        assert.ok(configAfter.biosSeed.length > 10, 'biosSeed should be substantive');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RECOVER-SEED
// ═══════════════════════════════════════════════════════════════════════════════

describe('integration: recover-seed', () => {
    let originalSeed;

    before(() => {
        cleanTestDir();
        runCLI(`init --agent-name IntegrationTest --api-url ${API_URL} --skip-email`);
        originalSeed = readTestConfig().biosSeed;
        // Strip seed
        const config = readTestConfig();
        delete config.biosSeed;
        writeTestConfig(config);
    });

    after(() => {
        cleanTestDir();
    });

    it('recover-seed restores the correct biosSeed', () => {
        const configBefore = readTestConfig();
        assert.ok(!configBefore.biosSeed, 'Precondition: seed should be missing');

        const { stdout } = runCLI(`recover-seed --api-url ${API_URL}`);
        assert.match(stdout, /recovered|saved/i, 'Should report success');

        const configAfter = readTestConfig();
        assert.ok(configAfter.biosSeed, 'biosSeed should be present');
        assert.equal(configAfter.biosSeed, originalSeed, 'Recovered seed MUST match original');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCTOR
// ═══════════════════════════════════════════════════════════════════════════════

describe('integration: doctor', () => {
    after(() => {
        cleanTestDir();
    });

    it('doctor reports healthy config (minus entry decryption)', () => {
        cleanTestDir();
        runCLI(`init --agent-name IntegrationTest --api-url ${API_URL} --skip-email`);

        const { stdout } = runCLI(`doctor --api-url ${API_URL}`);
        // Check all the critical config checks pass
        assert.match(stdout, /Config file:.*✓/, 'Config file check should pass');
        assert.match(stdout, /Wallet:.*✓/, 'Wallet check should pass');
        assert.match(stdout, /BIOS Seed:.*✓/, 'Seed check should pass');
        assert.match(stdout, /Agent registered:.*✓/, 'Agent registered check should pass');
        // Note: "Latest entry" may show decryption failure if the wallet has
        // entries encrypted with a different seed (e.g. production entries).
        // That's a legitimate finding, not a test failure.
    });

    it('doctor detects missing seed', () => {
        const config = readTestConfig();
        delete config.biosSeed;
        writeTestConfig(config);

        const { stdout } = runCLI(`doctor --api-url ${API_URL}`);
        assert.match(stdout, /BIOS Seed:.*✗.*MISSING/i, 'Should detect missing seed');
        assert.match(stdout, /recover-seed/, 'Should suggest recover-seed');
        assert.match(stdout, /issue.*found/i, 'Should report issues');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENV ISOLATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('integration: env isolation', () => {
    it('test config dir is separate from production', () => {
        const prodConfig = join(homedir(), '.crabspace', 'config.json');
        const prodBefore = existsSync(prodConfig) ? readFileSync(prodConfig, 'utf-8') : null;

        cleanTestDir();
        runCLI(`init --agent-name IsolationTest --api-url ${API_URL} --skip-email`);

        const prodAfter = existsSync(prodConfig) ? readFileSync(prodConfig, 'utf-8') : null;
        assert.equal(prodBefore, prodAfter, 'Production config must be UNTOUCHED by integration tests');

        cleanTestDir();
    });
});
