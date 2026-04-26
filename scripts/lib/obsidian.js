import fs from 'fs';

const VAULT = 'knowledge';

function write(path, content) {
  fs.mkdirSync(require_path(path), { recursive: true });
  fs.writeFileSync(path, content);
  return path;
}

function require_path(filePath) {
  return filePath.substring(0, filePath.lastIndexOf('/'));
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function now() {
  return new Date().toISOString();
}

// ── Issue note ────────────────────────────────────────────────────────────────

export function logIssue(number, title, body, agentResult) {
  const path = `${VAULT}/logs/issues/issue-${number}.md`;
  const prNote = `[[pr-${number}]]`;

  fs.mkdirSync(`${VAULT}/logs/issues`, { recursive: true });
  fs.writeFileSync(path, `---
title: "Issue #${number}: ${title}"
type: issue
number: ${number}
date: ${today()}
status: processed
tags: [issue, agent-fix]
related: [${prNote}]
---

# Issue #${number}: ${title}

**Date:** ${now()}

## Problem
${body}

## Agent Analysis
${agentResult.analysis}

## Files Changed
${agentResult.files?.map(f => `- **${f.action}**: \`${f.path}\``).join('\n') || '_no files changed_'}

## PR
**Title:** ${agentResult.pr_title}

${agentResult.pr_body}

---
*Logged by [[AI Lab Agent]]*
`);

  updateIndex();
  return path;
}

// ── PR note ───────────────────────────────────────────────────────────────────

export function logPR(number, title, review) {
  const path = `${VAULT}/logs/prs/pr-${number}.md`;
  const issueNote = `[[issue-${number}]]`;

  fs.mkdirSync(`${VAULT}/logs/prs`, { recursive: true });
  fs.writeFileSync(path, `---
title: "PR #${number}: ${title}"
type: pr
number: ${number}
date: ${today()}
status: reviewed
tags: [pr, code-review]
related: [${issueNote}]
---

# PR #${number}: ${title}

**Date:** ${now()}

## Code Review
${review}

---
*Reviewed by [[AI Lab Agent]]*
`);

  updateIndex();
  return path;
}

// ── Index (Map of Content) ────────────────────────────────────────────────────

function updateIndex() {
  const issues = listNotes(`${VAULT}/logs/issues`);
  const prs = listNotes(`${VAULT}/logs/prs`);

  const path = `${VAULT}/INDEX.md`;
  fs.writeFileSync(path, `---
title: AI Lab — Memory Index
type: index
updated: ${now()}
tags: [index, moc]
---

# AI Lab Memory

## Issues
${issues.map(f => `- [[${stem(f)}]]`).join('\n') || '_none yet_'}

## Pull Requests
${prs.map(f => `- [[${stem(f)}]]`).join('\n') || '_none yet_'}

---
*Auto-updated by agent pipeline*
`);
}

function listNotes(dir) {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== '.gitkeep');
  } catch {
    return [];
  }
}

function stem(filename) {
  return filename.replace(/\.md$/, '');
}
