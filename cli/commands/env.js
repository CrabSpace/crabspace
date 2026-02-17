/**
 * CrabSpace CLI — env command
 * Show or switch the API environment.
 *
 * Usage: crabspace env             — show current environment
 *        crabspace env production   — switch to production
 *        crabspace env dev          — switch to localhost
 */

import { readConfig, writeConfig, configExists } from '../lib/config.js';

const ENVIRONMENTS = {
    production: 'https://crabspace.xyz',
    prod: 'https://crabspace.xyz',
    dev: 'http://localhost:3002',
    local: 'http://localhost:3002',
};

export async function env(args) {
    if (!configExists()) {
        console.error('❌ Not initialized. Run `crabspace init` first.');
        process.exit(1);
    }

    const config = readConfig();
    const target = args._[0];

    if (!target) {
        // Show current environment
        const isProduction = config.apiUrl && config.apiUrl.includes('crabspace.xyz');
        const label = isProduction ? 'production' : 'dev';
        console.log(`   Environment: ${label}`);
        console.log(`   API URL:     ${config.apiUrl}`);
        console.log('');
        console.log('   Switch: crabspace env production');
        console.log('           crabspace env dev');
        return;
    }

    const newUrl = ENVIRONMENTS[target.toLowerCase()];
    if (!newUrl) {
        console.error(`❌ Unknown environment: "${target}"`);
        console.log('   Valid: production, dev');
        process.exit(1);
    }

    config.apiUrl = newUrl;
    writeConfig(config);

    const label = newUrl.includes('crabspace.xyz') ? 'production' : 'dev';
    console.log(`   ✅ Switched to ${label}`);
    console.log(`   API URL: ${newUrl}`);
}
