import fs from 'fs';

export function logIssue(number, title, body, agentResult) {
  const logDir = 'knowledge/logs/issues';
  fs.mkdirSync(logDir, { recursive: true });

  const logPath = `${logDir}/issue-${number}.md`;
  fs.writeFileSync(logPath, `# Issue #${number}: ${title}

**Date:** ${new Date().toISOString()}
**Status:** processed

## Problem
${body}

## Agent Analysis
${agentResult.analysis}

## Files Changed
${agentResult.files?.map(f => `- **${f.action}**: \`${f.path}\``).join('\n') || '_no files changed_'}

## PR
**Title:** ${agentResult.pr_title}

${agentResult.pr_body}
`);

  return logPath;
}

export function logPR(number, title, review) {
  const logDir = 'knowledge/logs/prs';
  fs.mkdirSync(logDir, { recursive: true });

  const logPath = `${logDir}/pr-${number}.md`;
  fs.writeFileSync(logPath, `# PR #${number}: ${title}

**Date:** ${new Date().toISOString()}

## Code Review
${review}
`);

  return logPath;
}
