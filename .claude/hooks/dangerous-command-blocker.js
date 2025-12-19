#!/usr/bin/env node
import { readInput, approve, block, context } from './utils.js';

const PROTECTED_DIRS = ['/etc', '/usr', '/var', '/bin', '/sbin', '/lib', '/opt', '/System', '/Applications', '/Library'];
const PROTECTED_USER_DIRS = ['.ssh', '.gnupg', '.config'];

async function main() {
  const input = await readInput();
  const command = input.tool_input?.command || '';

  if (!command) {
    approve();
    return;
  }

  // Home directory protection
  if (/rm\s+(-[rfRF]+\s+)*~\/?(\s|$)/.test(command)) {
    block('🚨 BLOCKED: Cannot delete home directory (~)');
    return;
  }

  if (/rm\s+(-[rfRF]+\s+)*\$\{?HOME\}?\/?(\s|$)/.test(command)) {
    block('🚨 BLOCKED: Cannot delete home directory ($HOME)');
    return;
  }

  // Root filesystem protection
  if (/rm\s+(-[rfRF]+\s+)*\/(\s|$|\*)/.test(command)) {
    block('🚨 BLOCKED: Cannot delete root filesystem (/)');
    return;
  }

  // System directory protection
  for (const dir of PROTECTED_DIRS) {
    const pattern = new RegExp(`rm\\s+(-[rfRF]+\\s+)*${dir.replace('/', '\\/')}\\/?(\s|$)`);
    if (pattern.test(command)) {
      block(`🚨 BLOCKED: Cannot delete protected system directory (${dir})`);
      return;
    }
  }

  // User config protection
  for (const dir of PROTECTED_USER_DIRS) {
    const pattern = new RegExp(`rm\\s+(-[rfRF]+\\s+)*~\\/${dir}\\/?(\s|$)`);
    if (pattern.test(command)) {
      block(`🚨 BLOCKED: Cannot delete sensitive user config (~/${dir})`);
      return;
    }
  }

  // Dangerous operations
  if (/(curl|wget)\s+[^|]+\|\s*(sudo\s+)?(ba)?sh/.test(command)) {
    block('🚨 BLOCKED: Piping downloaded content to shell is dangerous');
    return;
  }

  if (/dd\s+.*of=\/dev\/(sd|hd|vd|xvd|nvme|disk)/.test(command)) {
    block('🚨 BLOCKED: Cannot write directly to block devices');
    return;
  }

  if (/:\(\)\s*\{.*\}.*:/.test(command)) {
    block('🚨 BLOCKED: Fork bomb detected');
    return;
  }

  if (/git\s+push\s+(-f|--force)\s+\S+\s+(main|master)(\s|$)/.test(command) ||
      /git\s+push\s+.*--force.*\s+(main|master)(\s|$)/.test(command)) {
    block('🚨 BLOCKED: Force push to main/master is not allowed');
    return;
  }

  if (/(chmod|chown)\s+-[rR]\S*\s+\S+\s+(\/|~|\/Users|\/home)\/?(\s|$)/.test(command)) {
    block('🚨 BLOCKED: Recursive permission change on system directory');
    return;
  }

  if (/mkfs\.?\S*\s+\/dev\//.test(command)) {
    block('🚨 BLOCKED: Cannot format devices');
    return;
  }

  if (/sudo\s+rm\s+(-[rfRF]+\s+)*(\/|~|\$HOME)/.test(command)) {
    block('🚨 BLOCKED: sudo rm on root/home is not allowed');
    return;
  }

  // Warnings (non-blocking)
  const warnings = [];

  if (/rm\s+(-[rfRF]+)/.test(command)) {
    warnings.push('⚠️ Using rm with force/recursive flags');
  }

  if (/^sudo\s/.test(command)) {
    warnings.push('⚠️ Running with sudo');
  }

  if (/git\s+push\s+(-f|--force)/.test(command)) {
    warnings.push('⚠️ Force pushing');
  }

  if (warnings.length > 0) {
    context(warnings.join('. '));
    return;
  }

  approve();
}

main().catch(() => process.exit(0));
