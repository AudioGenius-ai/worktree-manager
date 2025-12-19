#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || path.join(__dirname, '..', '..');
export const TASKS_DIR = path.join(PROJECT_ROOT, 'tasks');
export const REQUIREMENTS_DIR = path.join(PROJECT_ROOT, 'requirements');

export async function readInput() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
    setTimeout(() => resolve({}), 100);
  });
}

export function output(result) {
  console.log(JSON.stringify(result));
}

export function approve(context) {
  output(context ? { decision: 'approve', additionalContext: context } : { decision: 'approve' });
}

export function block(reason, context) {
  output({ decision: 'block', reason, ...(context && { additionalContext: context }) });
}

export function context(additionalContext) {
  output({ additionalContext });
}

export function countFiles(dir, pattern) {
  try {
    if (!fs.existsSync(dir)) return 0;
    const files = fs.readdirSync(dir);
    return files.filter(f => f.match(new RegExp(pattern))).length;
  } catch {
    return 0;
  }
}

export function findFiles(dir, pattern) {
  try {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    return files.filter(f => f.match(new RegExp(pattern)));
  } catch {
    return [];
  }
}

export function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

export function fileExists(filePath) {
  return fs.existsSync(filePath);
}
