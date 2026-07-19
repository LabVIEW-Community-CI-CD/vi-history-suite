#!/usr/bin/env node

'use strict';

/**
 * Agent-delegation drift gate.
 *
 * Every issue template that offers a "delegated agent" / "suggested agent"
 * dropdown must only list options that map to a real agent definition under
 * .github/agents/<slug>.agent.md (plus an allowed non-agent sentinel such as
 * "unsure"). This keeps the issue-form dropdowns from drifting away from the
 * actual agent roster as agents are added, renamed, or removed.
 *
 * Each dropdown option is expected to lead with the agent slug, e.g.
 * "workflow-governor (general implementation ...)". Pure over an injected
 * filesystem so it is unit-testable; a thin CLI exits non-zero on drift.
 */

const fs = require('node:fs');
const path = require('node:path');

const AGENTS_DIR = path.join('.github', 'agents');
const ISSUE_TEMPLATE_DIR = path.join('.github', 'ISSUE_TEMPLATE');
const AGENT_FILE_PATTERN = /^([a-z0-9-]+)\.agent\.md$/;
// Non-agent dropdown options that are allowed (routing sentinels).
const ALLOWED_SENTINELS = new Set(['unsure']);
// Dropdown ids that select an agent.
const AGENT_DROPDOWN_IDS = new Set(['delegated_agent']);

function defaultDeps() {
  return {
    readdirSync: (dir) => fs.readdirSync(dir),
    readFileSync: (file) => fs.readFileSync(file, 'utf8'),
    existsSync: (file) => fs.existsSync(file)
  };
}

/** The agent slugs that have a real .github/agents/<slug>.agent.md file. */
function discoverAgentSlugs(repoRoot, deps) {
  const dir = path.join(repoRoot, AGENTS_DIR);
  if (!deps.existsSync(dir)) {
    return new Set();
  }
  return new Set(
    deps
      .readdirSync(dir)
      .map((name) => AGENT_FILE_PATTERN.exec(name))
      .filter((match) => match !== null)
      .map((match) => match[1])
  );
}

/**
 * Extracts agent-dropdown options from an issue-template YAML body without a
 * YAML dependency: finds each `- type: dropdown` whose `id:` is an agent
 * dropdown id and returns the leading token of each `options:` list item.
 */
function extractAgentDropdownOptions(templateText) {
  const lines = templateText.split(/\r?\n/);
  const options = [];
  let inAgentDropdown = false;
  let inOptions = false;
  let currentId = null;
  let blockIndent = 0;

  for (const line of lines) {
    const typeMatch = /^(\s*)- type:\s*(\S+)/.exec(line);
    if (typeMatch) {
      // A new block resets dropdown tracking.
      inAgentDropdown = false;
      inOptions = false;
      currentId = null;
      blockIndent = typeMatch[1].length;
      if (typeMatch[2] === 'dropdown') {
        inAgentDropdown = null; // pending id resolution
      }
      continue;
    }
    if (inAgentDropdown === null) {
      const idMatch = /^\s*id:\s*(\S+)/.exec(line);
      if (idMatch) {
        currentId = idMatch[1];
        inAgentDropdown = AGENT_DROPDOWN_IDS.has(currentId);
      }
    }
    if (inAgentDropdown === true) {
      if (/^\s*options:\s*$/.test(line)) {
        inOptions = true;
        continue;
      }
      if (inOptions) {
        const optionMatch = /^(\s*)-\s+(.*\S)\s*$/.exec(line);
        if (optionMatch && optionMatch[1].length > blockIndent) {
          // Leading token before a space or parenthesis is the agent slug.
          const slug = optionMatch[2].split(/[\s(]/)[0];
          options.push(slug);
        } else if (/^\S/.test(line) || /^\s*- type:/.test(line)) {
          inOptions = false;
        }
      }
    }
  }
  return options;
}

/** Audits issue-template agent dropdowns against the real agent roster. */
function auditAgentDelegation(repoRoot, deps = defaultDeps()) {
  const violations = [];
  const slugs = discoverAgentSlugs(repoRoot, deps);
  const templateDir = path.join(repoRoot, ISSUE_TEMPLATE_DIR);
  if (!deps.existsSync(templateDir)) {
    return { ok: true, violations };
  }

  const templates = deps.readdirSync(templateDir).filter((name) => name.endsWith('.yml'));
  for (const template of templates) {
    const text = deps.readFileSync(path.join(templateDir, template));
    for (const option of extractAgentDropdownOptions(text)) {
      if (ALLOWED_SENTINELS.has(option)) {
        continue;
      }
      if (!slugs.has(option)) {
        violations.push(
          `Issue template ${template} offers agent "${option}" with no .github/agents/${option}.agent.md file.`
        );
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

function main(repoRoot = process.cwd()) {
  const result = auditAgentDelegation(repoRoot);
  if (result.ok) {
    process.stdout.write('[agent-delegation] Issue-template agent dropdowns match the agent roster.\n');
    return 0;
  }
  process.stderr.write('[agent-delegation] Agent-delegation drift detected:\n');
  for (const violation of result.violations) {
    process.stderr.write(`  - ${violation}\n`);
  }
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { auditAgentDelegation, extractAgentDropdownOptions, discoverAgentSlugs };
