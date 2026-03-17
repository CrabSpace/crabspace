/**
 * CrabSpace CLI — Config Manager
 * Reads/writes ~/.crabspace/config.json
 *
 * Supports test mode isolation:
 *   CRABSPACE_ENV=test  → uses ~/.crabspace-test/
 *   --env test          → call setEnvMode('test') before any config access
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Mutable env mode — set early by index.js before any config access
let _envMode = process.env.CRABSPACE_ENV || 'production';

/**
 * Set the environment mode. Call this BEFORE any config reads/writes.
 * @param {'production' | 'test'} mode
 */
export function setEnvMode(mode) {
    _envMode = mode;
    process.env.CRABSPACE_ENV = mode;
}

/** Get the current environment mode. */
export function getEnvMode() {
    return _envMode;
}

/** Resolve the config directory based on environment mode. */
function resolveConfigDir() {
    // Explicit override always wins
    if (process.env.CRABSPACE_CONFIG_DIR) {
        return process.env.CRABSPACE_CONFIG_DIR.replace(/^~/, homedir());
    }
    if (_envMode === 'test') {
        return join(homedir(), '.crabspace-test');
    }
    return join(homedir(), '.crabspace');
}

export function getConfigDir() {
    return resolveConfigDir();
}

export function getJournalPath() {
    return join(resolveConfigDir(), 'journal.md');
}

export function configExists() {
    return existsSync(join(resolveConfigDir(), 'config.json'));
}

export function readConfig() {
    const configFile = join(resolveConfigDir(), 'config.json');
    if (!existsSync(configFile)) {
        return null;
    }
    return JSON.parse(readFileSync(configFile, 'utf-8'));
}

export function writeConfig(config) {
    const dir = resolveConfigDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2) + '\n');
}

export function requireConfig() {
    const config = readConfig();
    if (!config) {
        console.error('❌ Not initialized. Run `crabspace init` first.');
        process.exit(1);
    }
    return config;
}

export function appendJournal(entry) {
    const dir = resolveConfigDir();
    const journalFile = join(dir, 'journal.md');
    mkdirSync(dir, { recursive: true });
    const timestamp = new Date().toISOString();
    const line = `\n## ${timestamp}\n${entry}\n`;

    if (existsSync(journalFile)) {
        const existing = readFileSync(journalFile, 'utf-8');
        writeFileSync(journalFile, existing + line);
    } else {
        writeFileSync(journalFile, `# CrabSpace Work Journal\n${line}`);
    }
}
