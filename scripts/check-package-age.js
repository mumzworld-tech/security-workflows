#!/usr/bin/env node
'use strict';

// Checks all dependencies for packages published within the last 7 days
// Exit code 1 = policy violation found, 0 = all clear

const https = require('https');
const fs = require('fs');
const path = require('path');

const MAX_AGE_DAYS = parseInt(process.env.PACKAGE_AGE_DAYS || '7', 10);
const VIOLATIONS = [];

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'PrismSentinel/1.0' } }, (res) => {
      if (res.statusCode !== 200) return resolve(null);
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

function daysSince(dateStr) {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}

async function checkNpmPackage(name, version) {
  const data = await fetch(`https://registry.npmjs.org/${name}`);
  if (!data || !data.time) return null;
  // Check the specific version publish time, fallback to latest modified
  const publishDate = data.time[version] || data.time.modified;
  if (!publishDate) return null;
  const age = daysSince(publishDate);
  if (age < MAX_AGE_DAYS) {
    return { name, version, publishDate, ageDays: Math.round(age * 10) / 10 };
  }
  return null;
}

async function checkComposerPackage(name, version) {
  const data = await fetch(`https://repo.packagist.org/p2/${name}.json`);
  if (!data || !data.packages || !data.packages[name]) return null;
  const versions = data.packages[name];
  const match = versions.find(v => v.version === version || v.version === `v${version}`);
  if (!match || !match.time) return null;
  const age = daysSince(match.time);
  if (age < MAX_AGE_DAYS) {
    return { name, version, publishDate: match.time, ageDays: Math.round(age * 10) / 10 };
  }
  return null;
}

async function scanNpm(dir) {
  const lockFile = path.join(dir, 'package-lock.json');
  if (!fs.existsSync(lockFile)) return;

  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  const packages = lock.packages || {};

  // Collect direct + transitive deps
  const deps = [];
  for (const [key, val] of Object.entries(packages)) {
    if (!key || key === '') continue; // skip root
    const name = key.replace(/^node_modules\//, '');
    if (val.version) deps.push({ name, version: val.version });
  }

  console.log(`  Checking ${deps.length} npm packages...`);
  // Check in batches of 20
  for (let i = 0; i < deps.length; i += 20) {
    const batch = deps.slice(i, i + 20);
    const results = await Promise.all(batch.map(d => checkNpmPackage(d.name, d.version)));
    results.filter(Boolean).forEach(v => VIOLATIONS.push({ ...v, ecosystem: 'npm' }));
  }
}

async function scanComposer(dir) {
  const lockFile = path.join(dir, 'composer.lock');
  if (!fs.existsSync(lockFile)) return;

  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  const packages = [...(lock.packages || []), ...(lock['packages-dev'] || [])];

  console.log(`  Checking ${packages.length} composer packages...`);
  for (let i = 0; i < packages.length; i += 10) {
    const batch = packages.slice(i, i + 10);
    const results = await Promise.all(batch.map(p => checkComposerPackage(p.name, p.version)));
    results.filter(Boolean).forEach(v => VIOLATIONS.push({ ...v, ecosystem: 'composer' }));
  }
}

async function main() {
  const dir = process.argv[2] || '.';
  console.log(`🔍 Package Age Policy Check (max age: ${MAX_AGE_DAYS} days)`);
  console.log(`   Directory: ${path.resolve(dir)}\n`);

  await scanNpm(dir);
  await scanComposer(dir);

  if (VIOLATIONS.length === 0) {
    console.log('\n✅ All packages pass the age policy.');
    process.exit(0);
  }

  console.log(`\n❌ ${VIOLATIONS.length} package(s) violate the ${MAX_AGE_DAYS}-day age policy:\n`);
  console.log('Package | Version | Ecosystem | Published | Age (days)');
  console.log('--------|---------|-----------|-----------|----------');
  for (const v of VIOLATIONS) {
    console.log(`${v.name} | ${v.version} | ${v.ecosystem} | ${v.publishDate.split('T')[0]} | ${v.ageDays}`);
  }

  // Output for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `violations=${JSON.stringify(VIOLATIONS)}\n`);
  }

  process.exit(1);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
