import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logIssue } from './lib/obsidian.js';

const client = new Anthropic();

const issueNumber = process.env.ISSUE_NUMBER;
const issueTitle = process.env.ISSUE_TITLE;
const issueBody = process.env.ISSUE_BODY || '';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf-8' }).trim();
}

function gh(...args) {
  return execFileSync('gh', args, { encoding: 'utf-8' }).trim();
}

function getRepoContext() {
  try {
    const files = execFileSync('find', [
      '.', '-type', 'f',
      '(', '-name', '*.js', '-o', '-name', '*.ts', '-o',
           '-name', '*.py', '-o', '-name', '*.md', ')',
      '!', '-path', '*/node_modules/*',
      '!', '-path', '*/.git/*',
      '!', '-path', '*/dist/*',
    ], { encoding: 'utf-8' })
      .trim().split('\n').filter(Boolean).slice(0, 30);

    let context = '';
    let totalChars = 0;
    for (const file of files) {
      if (totalChars >= 30000) break;
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const entry = `\n\n=== ${file} ===\n${content}`;
        context += entry;
        totalChars += entry.length;
      } catch {}
    }
    return context;
  } catch {
    return '';
  }
}

function parseJSON(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(match ? match[1] : text);
}

async function main() {
  console.log(`[issue-agent] Processing issue #${issueNumber}: ${issueTitle}`);

  const branch = `fix/issue-${issueNumber}`;

  git('config', 'user.email', 'agent@ai-lab.dev');
  git('config', 'user.name', 'AI Lab Agent');
  git('checkout', '-b', branch);

  const repoContext = getRepoContext();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are an autonomous code fix agent. Analyze the GitHub issue and produce minimal, correct fixes.

Respond with raw JSON only (no markdown, no wrapping):
{
  "analysis": "brief analysis of the issue",
  "files": [
    {
      "path": "relative/file/path",
      "content": "full file content after fix",
      "action": "create or update"
    }
  ],
  "pr_title": "concise PR title",
  "pr_body": "markdown PR description"
}

Return empty "files" array if no code changes are needed.`,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Issue #${issueNumber}: ${issueTitle}\n\n${issueBody}`,
          },
          {
            type: 'text',
            text: `Repository context:\n${repoContext}`,
            cache_control: { type: 'ephemeral' },
          },
        ],
      },
    ],
  });

  let result;
  try {
    result = parseJSON(response.content[0].text);
  } catch {
    console.error('[issue-agent] Claude response:', response.content[0].text);
    throw new Error('Claude did not return valid JSON');
  }

  console.log(`[issue-agent] Analysis: ${result.analysis}`);

  for (const file of result.files || []) {
    const dir = path.dirname(file.path);
    if (dir !== '.') fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file.path, file.content);
    git('add', file.path);
    console.log(`[issue-agent] ${file.action}: ${file.path}`);
  }

  const logPath = logIssue(issueNumber, issueTitle, issueBody, result);
  git('add', logPath);

  git('commit', '-m', `fix: ${result.pr_title} (closes #${issueNumber})`);
  execFileSync('git', ['push', 'origin', branch]);

  const prBodyFile = `/tmp/pr-body-${issueNumber}.md`;
  fs.writeFileSync(prBodyFile, result.pr_body);
  gh('pr', 'create',
    '--title', result.pr_title,
    '--body-file', prBodyFile,
    '--head', branch,
    '--base', 'main',
  );

  console.log(`[issue-agent] PR opened for issue #${issueNumber}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
