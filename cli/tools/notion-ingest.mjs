#!/usr/bin/env node

/**
 * CrabSpace Notion Ingest Pipeline
 * 
 * Parses a Notion export directory, filters stubs, generates a manifest
 * of ingestible documents, and optionally submits them to the vault.
 * 
 * Usage:
 *   node notion-ingest.mjs scan <notion-export-dir>          # Scan & generate manifest
 *   node notion-ingest.mjs preview <manifest.json> [--limit 5] # Preview entries before submit
 *   node notion-ingest.mjs submit <manifest.json> [--dry-run]  # Submit to vault
 *   node notion-ingest.mjs stats <notion-export-dir>           # Quick stats
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename, extname, relative, dirname } from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';

// ─── CONFIG ────────────────────────────────────────────────────────────────────

const MIN_CONTENT_BYTES = 500;      // Skip files smaller than this (Notion DB row stubs)
const MAX_TAGS = 20;                 // CLI limit
const SUMMARY_MAX_CHARS = 150;       // Public summary limit
const SUBMIT_TIMEOUT_MS = 120000;    // 2 minutes per entry
const VERIFY_DELAY_MS = 2000;        // Wait before verification check

// ─── TAG SANITIZATION ──────────────────────────────────────────────────────────

/**
 * Sanitize tags for CLI compatibility.
 * Colons get stripped by the CLI's tag parser — replace with hyphens.
 * Also normalizes whitespace and removes invalid characters.
 */
function sanitizeTag(tag) {
    return tag
        .replace(/:/g, '-')           // colons → hyphens
        .replace(/[^a-z0-9\-_]/g, '') // strip anything non-alphanumeric/hyphen/underscore
        .replace(/--+/g, '-')         // collapse multiple hyphens
        .replace(/^-|-$/g, '');        // trim leading/trailing hyphens
}

function sanitizeTags(tags) {
    return tags.map(sanitizeTag).filter(t => t.length > 0);
}

// ─── DUPLICATE DETECTION ───────────────────────────────────────────────────────

/**
 * Generate a content hash for duplicate detection.
 * Uses full content + title to create a fingerprint.
 * Must use full content — truncated hashes falsely flag different
 * versions of documents (e.g., Whitepaper v1 vs v2) as duplicates.
 */
function contentHash(title, content) {
    const fingerprint = `${title}::${content}`;
    return createHash('sha256').update(fingerprint).digest('hex').slice(0, 16);
}

/**
 * Check if an entry already exists in the vault by searching for its source file.
 * 
 * IMPORTANT: We search by private-tags (notion-import) and then check if the
 * source filename appears in the actual result entries (lines starting with 📄).
 * We do NOT use --keyword because the CLI echoes the keyword back in the output,
 * which caused false positives (every file appeared to already exist).
 */
function checkForExistingEntry(sourceFile) {
    try {
        const result = execSync(
            `crabspace search --private-tags notion-import 2>&1`,
            { timeout: 15000, encoding: 'utf-8' }
        );
        // Only check actual source file reference lines (📄 prefix)
        // This avoids matching the CLI's own echo of search parameters
        const resultLines = result.split('\n').filter(l => l.includes('📄'));
        for (const line of resultLines) {
            if (line.includes(sourceFile.slice(0, 40))) {
                return true;
            }
        }
    } catch (e) {
        // Search failed — don't block, proceed with caution
    }
    return false;
}

// ─── NOTION FILENAME CLEANING ──────────────────────────────────────────────────

/**
 * Notion exports filenames as: "My Document Title abc123def456.md"
 * where the last 32-char hex string is the Notion page UUID.
 * This strips it to get the clean title.
 */
function cleanNotionFilename(filename) {
    // Remove .md extension
    let name = filename.replace(/\.md$/, '');
    // Remove Notion UUID (32 hex chars at end, preceded by a space)
    name = name.replace(/\s+[a-f0-9]{32}$/, '');
    // Clean up any remaining artifacts
    name = name.trim();
    return name || filename;
}

/**
 * Detect the content domain from the file path.
 * Uses parent folder names to infer project/domain context.
 */
function detectDomain(relativePath) {
    const pathLower = relativePath.toLowerCase();
    
    const domainPatterns = [
        { pattern: /adult fantasy|afhq|af series|af\b/i, domain: 'adult-fantasy' },
        { pattern: /goshi/i, domain: 'goshi' },
        { pattern: /atomic startup/i, domain: 'atomic-startup' },
        { pattern: /soulbound/i, domain: 'soulbound-business' },
        { pattern: /3w3m|three worlds/i, domain: '3w3m' },
        { pattern: /mythmachines/i, domain: 'mythmachines' },
        { pattern: /narrative funnel/i, domain: 'narrative-funnel' },
        { pattern: /tac\b|tokenized autonomous/i, domain: 'tac' },
        { pattern: /the stack|creative os|portable creative/i, domain: 'creative-os' },
        { pattern: /copy quest|deep copy/i, domain: 'copy-craft' },
        { pattern: /crabspace/i, domain: 'crabspace' },
        { pattern: /healthy clean|hch/i, domain: 'hch-business' },
        { pattern: /lore games|story circle/i, domain: 'lore-games' },
        { pattern: /date.?mate/i, domain: 'date-mate' },
        { pattern: /wormhole/i, domain: 'wormhole' },
        { pattern: /t\.?i\.?t\.?s|this is the show/i, domain: 'tits-youtube' },
        { pattern: /webinar/i, domain: 'webinars' },
        { pattern: /worksheet|cheatsheet/i, domain: 'worksheets' },
    ];
    
    for (const { pattern, domain } of domainPatterns) {
        if (pattern.test(relativePath)) return domain;
    }
    return 'general';
}

/**
 * Detect content type from the document text.
 */
function detectContentType(content, filename) {
    const lower = content.toLowerCase();
    const name = filename.toLowerCase();
    
    if (name.includes('whitepaper') || lower.includes('whitepaper')) return 'whitepaper';
    if (name.includes('playbook') || lower.includes('playbook')) return 'playbook';
    if (name.includes('framework') || lower.includes('framework')) return 'framework';
    if (name.includes('template') || lower.includes('template')) return 'template';
    if (name.includes('script') && (lower.includes('scene') || lower.includes('dialogue'))) return 'creative-script';
    if (name.includes('strategy') || name.includes('strategic') || lower.includes('strategic')) return 'strategy';
    if (name.includes('syllabus') || lower.includes('syllabus') || lower.includes('curriculum')) return 'syllabus';
    if (name.includes('pipeline') || name.includes('process')) return 'process';
    if (name.includes('prompt') || lower.includes('prompt for gpt')) return 'prompt-engineering';
    if (name.includes('plan') || name.includes('calendar') || lower.includes('90-day')) return 'planning';
    if (name.includes('debrief') || name.includes('retrospective')) return 'retrospective';
    if (lower.includes('mvp') || lower.includes('product spec')) return 'product-spec';
    if (lower.includes('newsletter') || lower.includes('content outline')) return 'content-plan';
    
    return 'note';
}

// ─── CONTENT QUALITY FILTERS ───────────────────────────────────────────────────

/**
 * Check if a file is a Notion database row stub.
 * These are small files with just a title and a few fields.
 */
function isStubFile(content, sizeBytes) {
    if (sizeBytes < MIN_CONTENT_BYTES) return true;
    
    // Files that are just a title + URL
    const lines = content.trim().split('\n').filter(l => l.trim().length > 0);
    if (lines.length <= 3) {
        const hasOnlyTitleAndLink = lines.length <= 2 && 
            lines[0].startsWith('#') && 
            (lines.length === 1 || lines[1]?.startsWith('http'));
        if (hasOnlyTitleAndLink) return true;
    }
    
    // Files that are just "# Untitled" or similar
    if (content.trim() === '# Untitled' || content.trim() === '# Untitled\n') return true;
    
    return false;
}

/**
 * Estimate whether a document contains substantive thinking
 * (vs operational data like call sheets, expense trackers, etc.)
 */
function isOperationalData(content, filename) {
    const lower = filename.toLowerCase();
    // Call sheets, expense trackers, CRM entries
    if (lower.includes('call sheet') || lower.includes('expense') || lower.includes('crm')) return true;
    if (lower.includes('terms of service reference') || lower.includes('privacy reference')) return true;
    
    // Content that's mostly addresses/phone numbers (database rows)
    const addressPattern = /\b\d+\s+\w+\s+(St|Ave|Rd|Dr|Ln|Way|Blvd)\b/gi;
    const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
    const addresses = (content.match(addressPattern) || []).length;
    const phones = (content.match(phonePattern) || []).length;
    if (addresses > 3 && phones > 3) return true;
    
    return false;
}

// ─── TAG EXTRACTION ────────────────────────────────────────────────────────────

/**
 * Extract basic tags from content without LLM (keyword-based).
 * These serve as a starting point; LLM observation will refine them.
 */
function extractBasicTags(content, domain, contentType) {
    const tags = new Set();
    const lower = content.toLowerCase();
    
    // Domain tag
    if (domain !== 'general') tags.add(domain);
    
    // Content type tag
    if (contentType !== 'note') tags.add(contentType);
    
    // Concept detection
    const conceptPatterns = [
        { pattern: /burnout|exhaustion|overwhelm/i, tag: 'burnout' },
        { pattern: /creator economy|creative entrepreneur/i, tag: 'creator-economy' },
        { pattern: /narrative funnel|storytelling.*marketing/i, tag: 'narrative-funnel' },
        { pattern: /tokeniz|nft|web3|blockchain/i, tag: 'web3' },
        { pattern: /ai agent|autonomous agent|eliza/i, tag: 'ai-agents' },
        { pattern: /community build|discord.*community/i, tag: 'community' },
        { pattern: /copywriting|sales copy|headlines/i, tag: 'copywriting' },
        { pattern: /worldbuilding|world-building|lore/i, tag: 'worldbuilding' },
        { pattern: /marketing|content calendar|launch/i, tag: 'marketing' },
        { pattern: /leadership|team|management/i, tag: 'leadership' },
        { pattern: /pricing|revenue|monetiz/i, tag: 'monetization' },
        { pattern: /psychology|emotional|mindset/i, tag: 'psychology' },
        { pattern: /framework|system|methodology/i, tag: 'frameworks' },
        { pattern: /solopreneur|indie|bootstrap/i, tag: 'indie-business' },
        { pattern: /newsletter|email.*list|subscriber/i, tag: 'email-marketing' },
        { pattern: /youtube|video.*content|production/i, tag: 'video-content' },
        { pattern: /trading|crypto|defi|solana/i, tag: 'crypto' },
        { pattern: /character.*system|npc|rpg/i, tag: 'game-design' },
    ];
    
    for (const { pattern, tag } of conceptPatterns) {
        if (pattern.test(lower)) tags.add(tag);
    }
    
    return Array.from(tags).slice(0, MAX_TAGS);
}

// ─── SCANNING ──────────────────────────────────────────────────────────────────

/**
 * Recursively walk a directory and collect all .md files.
 */
function walkDir(dir, fileList = []) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
        const fullPath = join(dir, entry);
        try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
                walkDir(fullPath, fileList);
            } else if (extname(entry) === '.md') {
                fileList.push({
                    path: fullPath,
                    size: stat.size,
                    modified: stat.mtime,
                });
            }
        } catch (e) {
            // Skip files we can't access
        }
    }
    return fileList;
}

/**
 * Scan a Notion export directory and generate an ingest manifest.
 */
function scanNotionExport(exportDir) {
    console.log(`\n🦀 CrabSpace Notion Ingest — Scanning: ${exportDir}\n`);
    
    const allFiles = walkDir(exportDir);
    console.log(`   📁 Total .md files found: ${allFiles.length}`);
    
    const manifest = {
        version: '1.0',
        source: 'notion',
        sourceDir: exportDir,
        scannedAt: new Date().toISOString(),
        entries: [],
        skipped: {
            stubs: 0,
            operational: 0,
            duplicates: 0,
        },
        stats: {
            totalFiles: allFiles.length,
            totalBytes: 0,
            domainsFound: new Set(),
            contentTypes: {},
        },
    };
    
    const seenTitles = new Set();
    
    for (const file of allFiles) {
        let content;
        try {
            content = readFileSync(file.path, 'utf-8');
        } catch (e) {
            continue;
        }
        
        manifest.stats.totalBytes += file.size;
        
        const relPath = relative(exportDir, file.path);
        const filename = basename(file.path);
        const title = cleanNotionFilename(filename);
        
        // Filter: stubs
        if (isStubFile(content, file.size)) {
            manifest.skipped.stubs++;
            continue;
        }
        
        // Filter: operational data
        if (isOperationalData(content, filename)) {
            manifest.skipped.operational++;
            continue;
        }
        
        // Filter: duplicates (Notion exports both folder.md and folder/folder.md)
        if (seenTitles.has(title.toLowerCase())) {
            manifest.skipped.duplicates++;
            continue;
        }
        seenTitles.add(title.toLowerCase());
        
        // Analyze
        const domain = detectDomain(relPath);
        const contentType = detectContentType(content, filename);
        const tags = extractBasicTags(content, domain, contentType);
        const wordCount = content.split(/\s+/).length;
        
        // Extract first meaningful paragraph as draft summary
        const paragraphs = content.split('\n\n').filter(p => 
            p.trim().length > 30 && 
            !p.startsWith('#') && 
            !p.startsWith('http') &&
            !p.startsWith('|')
        );
        const draftSummary = paragraphs[0] 
            ? paragraphs[0].replace(/\n/g, ' ').trim().slice(0, SUMMARY_MAX_CHARS)
            : '';
        
        manifest.stats.domainsFound.add(domain);
        manifest.stats.contentTypes[contentType] = (manifest.stats.contentTypes[contentType] || 0) + 1;
        
        manifest.entries.push({
            id: manifest.entries.length + 1,
            title,
            relativePath: relPath,
            absolutePath: file.path,
            sizeBytes: file.size,
            wordCount,
            domain,
            contentType,
            tags,
            draftSummary,
            privateTags: ['notion-import', `notion-${domain}`],
            contentHash: contentHash(title, content),
            status: 'pending',       // pending | approved | rejected | submitted | verified | duplicate
            needsLLMReview: wordCount > 200,  // Substantial docs get LLM observation
        });
    }
    
    // Convert Set to Array for JSON serialization
    manifest.stats.domainsFound = Array.from(manifest.stats.domainsFound);
    
    // Sort by domain, then by word count (largest first within domain)
    manifest.entries.sort((a, b) => {
        if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
        return b.wordCount - a.wordCount;
    });
    
    return manifest;
}

// ─── PREVIEW ───────────────────────────────────────────────────────────────────

function previewManifest(manifestPath, limit = 10) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    
    console.log(`\n🦀 CrabSpace Ingest Preview — ${manifest.entries.length} entries\n`);
    console.log(`   Source: ${manifest.sourceDir}`);
    console.log(`   Scanned: ${manifest.scannedAt}`);
    console.log(`   Domains: ${manifest.stats.domainsFound.join(', ')}`);
    console.log(`   Content types:`, manifest.stats.contentTypes);
    console.log(`   Skipped: ${manifest.skipped.stubs} stubs, ${manifest.skipped.operational} operational, ${manifest.skipped.duplicates} duplicates`);
    console.log(`\n   Showing first ${limit} entries:\n`);
    
    const entries = manifest.entries.slice(0, limit);
    for (const entry of entries) {
        console.log(`   ┌─ #${entry.id}: ${entry.title}`);
        console.log(`   │  Domain: ${entry.domain}  |  Type: ${entry.contentType}  |  Words: ${entry.wordCount}`);
        console.log(`   │  Tags: ${entry.tags.join(', ')}`);
        console.log(`   │  Private: ${entry.privateTags.join(', ')}`);
        if (entry.draftSummary) {
            console.log(`   │  Summary: ${entry.draftSummary.slice(0, 100)}...`);
        }
        console.log(`   └─ Status: ${entry.status}  |  Needs LLM: ${entry.needsLLMReview ? 'yes' : 'no'}`);
        console.log('');
    }
    
    // Domain breakdown
    const domainCounts = {};
    for (const entry of manifest.entries) {
        domainCounts[entry.domain] = (domainCounts[entry.domain] || 0) + 1;
    }
    console.log('   📊 Domain breakdown:');
    for (const [domain, count] of Object.entries(domainCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`      ${domain}: ${count} files`);
    }
    console.log('');
}

// ─── SUBMIT ────────────────────────────────────────────────────────────────────

async function submitEntries(manifestPath, dryRun = false, filterDomain = null) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    
    let entries = manifest.entries.filter(e => 
        e.status !== 'rejected' && e.status !== 'submitted' && 
        e.status !== 'verified' && e.status !== 'duplicate'
    );
    
    if (filterDomain) {
        entries = entries.filter(e => e.domain === filterDomain);
    }
    
    console.log(`\n🦀 CrabSpace Ingest Submit — ${entries.length} entries${dryRun ? ' (DRY RUN)' : ''}\n`);
    
    let submitted = 0;
    let verified = 0;
    let failed = 0;
    let skippedDupes = 0;
    const seenHashes = new Set();
    
    for (const entry of entries) {
        // ── DUPLICATE CHECK (content hash) ──────────────────────────────────
        if (seenHashes.has(entry.contentHash)) {
            console.log(`   ⏭️  [DUPE] #${entry.id}: ${entry.title} — duplicate content hash, skipping`);
            entry.status = 'duplicate';
            skippedDupes++;
            continue;
        }
        seenHashes.add(entry.contentHash);
        
        // ── VAULT DUPLICATE CHECK (search for existing source file) ──────
        const sourceFileName = basename(entry.relativePath);
        if (!dryRun && checkForExistingEntry(sourceFileName)) {
            console.log(`   ⏭️  [EXISTS] #${entry.id}: ${entry.title} — already in vault, skipping`);
            entry.status = 'duplicate';
            skippedDupes++;
            continue;
        }
        
        // ── READ CONTENT ────────────────────────────────────────────────────
        let content;
        try {
            content = readFileSync(entry.absolutePath, 'utf-8');
        } catch (e) {
            console.log(`   ❌ Could not read: ${entry.title}`);
            failed++;
            continue;
        }
        
        // ── BUILD CLI COMMAND ────────────────────────────────────────────────
        const tagsStr = sanitizeTags(entry.tags).join(',');
        const allPrivateTags = [...new Set([...entry.privateTags, 'source-todd'])];
        const privateTagsStr = sanitizeTags(allPrivateTags).join(',');
        const summary = (entry.draftSummary || entry.title).slice(0, SUMMARY_MAX_CHARS);
        
        // Write content to temp file to avoid shell escaping issues
        const tmpFile = `/tmp/crabspace-ingest-${entry.id}.txt`;
        writeFileSync(tmpFile, content);
        
        const cmd = [
            'crabspace submit',
            `--file "${tmpFile}"`,
            `--type operator-context`,
            `--tags "${tagsStr}"`,
            `--private-tags "${privateTagsStr}"`,
            `--summary "${summary.replace(/"/g, '\\"')}"`,
            `--private-summary "${entry.title.replace(/"/g, '\\"')} — Domain: ${entry.domain}, Type: ${entry.contentType}, Words: ${entry.wordCount}"`,
            `--source-author "Todd Wahnish"`,
            `--source-file "${sourceFileName}"`,
        ].join(' \\\n  ');
        
        if (dryRun) {
            console.log(`   🔍 [DRY RUN] #${entry.id}: ${entry.title}`);
            console.log(`      Tags: ${tagsStr.slice(0, 80)}...`);
            submitted++;
        } else {
            console.log(`   📤 Submitting #${entry.id}: ${entry.title}...`);
            try {
                // ── SUBMIT ──────────────────────────────────────────────────
                const output = execSync(cmd, { encoding: 'utf-8', timeout: SUBMIT_TIMEOUT_MS });
                entry.status = 'submitted';
                submitted++;
                console.log(`   ✅ Submitted.`);
                
                // ── POST-SUBMIT VERIFICATION ────────────────────────────────
                // Wait briefly for DB propagation, then verify
                await sleep(VERIFY_DELAY_MS);
                try {
                    const verifyResult = execSync(
                        `crabspace search --private-tags notion-import --keyword "${entry.title.slice(0, 30).replace(/"/g, '\\"')}" 2>&1`,
                        { encoding: 'utf-8', timeout: 15000 }
                    );
                    if (verifyResult.includes(sourceFileName.slice(0, 30))) {
                        entry.status = 'verified';
                        verified++;
                        console.log(`   🔒 Verified in vault.`);
                    } else {
                        console.log(`   ⚠️  Submitted but not found in vault search — may need manual check.`);
                    }
                } catch (ve) {
                    console.log(`   ⚠️  Submitted but verification search failed — entry may still be valid.`);
                }
            } catch (e) {
                entry.status = 'failed';
                entry.failReason = e.message?.slice(0, 200);
                console.log(`   ❌ Failed: ${e.message?.slice(0, 100)}`);
                failed++;
            }
        }
    }
    
    // ── SUMMARY ─────────────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`   📊 Ingest Results:`);
    console.log(`      Submitted:  ${submitted}`);
    console.log(`      Verified:   ${verified}`);
    console.log(`      Duplicates: ${skippedDupes} (skipped)`);
    console.log(`      Failed:     ${failed}`);
    console.log(`${'─'.repeat(50)}\n`);
    
    // Update manifest with new statuses
    if (!dryRun) {
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`   📋 Manifest updated: ${manifestPath}`);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── STATS ─────────────────────────────────────────────────────────────────────

function quickStats(exportDir) {
    const manifest = scanNotionExport(exportDir);
    
    console.log(`\n📊 Notion Export Stats`);
    console.log(`${'─'.repeat(50)}`);
    console.log(`   Total MD files:    ${manifest.stats.totalFiles}`);
    console.log(`   Total text size:   ${(manifest.stats.totalBytes / 1024 / 1024).toFixed(1)} MB`);
    console.log(`   Ingestible files:  ${manifest.entries.length}`);
    console.log(`   Skipped stubs:     ${manifest.skipped.stubs}`);
    console.log(`   Skipped ops data:  ${manifest.skipped.operational}`);
    console.log(`   Skipped dupes:     ${manifest.skipped.duplicates}`);
    console.log(`   Domains:           ${manifest.stats.domainsFound.join(', ')}`);
    console.log(`   Content types:     ${JSON.stringify(manifest.stats.contentTypes)}`);
    console.log(`   Need LLM review:   ${manifest.entries.filter(e => e.needsLLMReview).length}`);
    console.log(`   Quick ingest:      ${manifest.entries.filter(e => !e.needsLLMReview).length}`);
    console.log('');
}

// ─── CLI ───────────────────────────────────────────────────────────────────────

const [,, command, ...rest] = process.argv;

switch (command) {
    case 'scan': {
        const dir = rest[0];
        if (!dir) {
            console.error('Usage: node notion-ingest.mjs scan <notion-export-dir>');
            process.exit(1);
        }
        const manifest = scanNotionExport(dir);
        const outFile = rest[1] || 'notion-ingest-manifest.json';
        writeFileSync(outFile, JSON.stringify(manifest, null, 2));
        console.log(`\n   ✅ Manifest written: ${outFile}`);
        console.log(`   📄 ${manifest.entries.length} ingestible files found`);
        console.log(`   🚫 ${manifest.skipped.stubs + manifest.skipped.operational + manifest.skipped.duplicates} files filtered out`);
        console.log(`\n   Next: node notion-ingest.mjs preview ${outFile}\n`);
        break;
    }
    
    case 'preview': {
        const manifestPath = rest[0];
        if (!manifestPath) {
            console.error('Usage: node notion-ingest.mjs preview <manifest.json> [--limit N]');
            process.exit(1);
        }
        const limitIdx = rest.indexOf('--limit');
        const limit = limitIdx !== -1 ? parseInt(rest[limitIdx + 1]) : 10;
        previewManifest(manifestPath, limit);
        break;
    }
    
    case 'submit': {
        const manifestPath = rest[0];
        if (!manifestPath) {
            console.error('Usage: node notion-ingest.mjs submit <manifest.json> [--dry-run] [--domain adult-fantasy]');
            process.exit(1);
        }
        const dryRun = rest.includes('--dry-run');
        const domainIdx = rest.indexOf('--domain');
        const filterDomain = domainIdx !== -1 ? rest[domainIdx + 1] : null;
        submitEntries(manifestPath, dryRun, filterDomain).catch(e => {
            console.error(`❌ Ingest failed: ${e.message}`);
            process.exit(1);
        });
        break;
    }
    
    case 'stats': {
        const dir = rest[0];
        if (!dir) {
            console.error('Usage: node notion-ingest.mjs stats <notion-export-dir>');
            process.exit(1);
        }
        quickStats(dir);
        break;
    }
    
    default:
        console.log(`
🦀 CrabSpace Notion Ingest Pipeline

Usage:
  node notion-ingest.mjs scan <notion-export-dir>           Scan & generate manifest
  node notion-ingest.mjs preview <manifest.json> [--limit N] Preview entries
  node notion-ingest.mjs submit <manifest.json> [--dry-run]  Submit to vault
  node notion-ingest.mjs stats <notion-export-dir>           Quick stats

Workflow:
  1. scan   → generates manifest.json with all ingestible files
  2. preview → review entries, domains, tags
  3. submit  → send approved entries to CrabSpace vault
        `);
}
