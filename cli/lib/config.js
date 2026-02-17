/**
 * CrabSpace CLI — Config Manager
 * Reads/writes ~/.crabspace/config.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.crabspace');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const JOURNAL_FILE = join(CONFIG_DIR, 'journal.md');

export function getConfigDir() {
    return CONFIG_DIR;
}

export function getJournalPath() {
    return JOURNAL_FILE;
}

export function configExists() {
    return existsSync(CONFIG_FILE);
}

export function readConfig() {
    if (!existsSync(CONFIG_FILE)) {
        return null;
    }
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
}

export function writeConfig(config) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
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
    mkdirSync(CONFIG_DIR, { recursive: true });
    const timestamp = new Date().toISOString();
    const line = `\n## ${timestamp}\n${entry}\n`;

    if (existsSync(JOURNAL_FILE)) {
        const existing = readFileSync(JOURNAL_FILE, 'utf-8');
        writeFileSync(JOURNAL_FILE, existing + line);
    } else {
        writeFileSync(JOURNAL_FILE, `# CrabSpace Work Journal\n${line}`);
    }
}
