import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'child_process';
import fs from 'fs';
import { logPR } from './lib/obsidian.js';

const client = new Anthropic();
const prNumber = process.env.PR_NUMBER;

function gh(...args) {
  return execFileSync('gh', args, { encoding: 'utf-8' }).trim();
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf-8' }).trim();
}

async function main() {
  console.log(`[pr-reviewer] Reviewing PR #${prNumber}`);

  const prInfo = JSON.parse(
    gh('pr', 'view', prNumber, '--json', 'title,body,headRefName')
  );
  const diff = gh('pr', 'diff', prNumber);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are a thorough code reviewer. Review the PR diff and provide concise, actionable feedback.
Cover: correctness, edge cases, security, code quality. Use markdown. Be direct.`,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `PR #${prNumber}: ${prInfo.title}\n\n${prInfo.body}\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``,
            cache_control: { type: 'ephemeral' },
          },
        ],
      },
    ],
  });

  const review = response.content[0].text;

  const reviewFile = `/tmp/review-${prNumber}.md`;
  fs.writeFileSync(reviewFile, `## Automated Code Review\n\n${review}`);
  gh('pr', 'review', prNumber, '--comment', '--body-file', reviewFile);

  git('config', 'user.email', 'agent@ai-lab.dev');
  git('config', 'user.name', 'AI Lab Agent');

  const logPath = logPR(prNumber, prInfo.title, review);
  git('add', logPath);
  git('commit', '-m', `log: PR #${prNumber} reviewed`);
  execFileSync('git', ['push', 'origin', `HEAD:${prInfo.headRefName}`]);

  console.log(`[pr-reviewer] Review posted for PR #${prNumber}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
