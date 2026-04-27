/**
 * Octogent PR trigger: creates a tentacle + terminal for PR review,
 * then polls until the Claude Code agent finishes.
 */

const OCTOGENT_API = process.env.OCTOGENT_API ?? 'http://127.0.0.1:8787';
const POLL_INTERVAL_MS = 5000;
const TIMEOUT_MS = 20 * 60 * 1000; // 20 min

const prNumber = process.env.PR_NUMBER;
const prTitle = process.env.PR_TITLE;
const prBody = process.env.PR_BODY ?? '';
const prBranch = process.env.PR_BRANCH;

async function api(path, method = 'GET', body) {
  const res = await fetch(`${OCTOGENT_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Octogent API ${method} ${path} failed: ${err.error ?? res.status}`);
  }
  return res.json();
}

async function createTentacle(name) {
  const data = await api('/api/deck/tentacles', 'POST', { name });
  console.log(`[octogent-pr] Tentacle created: ${data.tentacleId}`);
  return data.tentacleId;
}

async function createTerminal(tentacleId, prompt) {
  const data = await api('/api/terminals', 'POST', {
    name: `review-pr-${prNumber}`,
    tentacleId,
    workspaceMode: 'shared',
    initialPrompt: prompt,
  });
  console.log(`[octogent-pr] Terminal created: ${data.terminalId}`);
  return data.terminalId;
}

async function stopTerminal(terminalId) {
  await api(`/api/terminals/${terminalId}/stop`, 'POST');
  console.log(`[octogent-pr] Terminal ${terminalId} stopped.`);
}

async function reviewPosted() {
  const { execSync } = await import('child_process');
  try {
    const out = execSync(
      `gh api repos/${process.env.GITHUB_REPOSITORY || ''}/issues/${prNumber}/comments --jq 'length'`,
      { env: { ...process.env, GH_TOKEN: process.env.GH_TOKEN } }
    ).toString().trim();
    return parseInt(out, 10) > 0;
  } catch {
    return false;
  }
}

async function pollUntilDone(terminalId) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const snapshots = await api('/api/terminal-snapshots');
    const terminal = snapshots.find(t => t.terminalId === terminalId);
    if (!terminal) throw new Error(`Terminal ${terminalId} not found`);
    console.log(`[octogent-pr] Terminal state: ${terminal.lifecycleState}`);
    if (terminal.lifecycleState === 'exited' || terminal.lifecycleState === 'stopped') {
      return terminal.lifecycleState;
    }
    // Review postalanmışsa terminali biz durduralım
    if (await reviewPosted()) {
      console.log(`[octogent-pr] Review detected for PR #${prNumber}, stopping terminal.`);
      await stopTerminal(terminalId);
      return 'exited';
    }
  }
  throw new Error('Timed out waiting for terminal to finish');
}

async function main() {
  console.log(`[octogent-pr] Reviewing PR #${prNumber}: ${prTitle}`);

  const tentacleId = await createTentacle(`review-pr-${prNumber}`);

  const prompt = `You are an autonomous code reviewer for the ai-lab repo.

PR #${prNumber}: ${prTitle}
Branch: ${prBranch}

${prBody}

Instructions:
1. Get the PR diff: gh pr diff ${prNumber}
2. Review the diff for correctness, edge cases, security, and code quality.
3. Write your review to a temp file: /tmp/review-${prNumber}.md
   Format: "## Code Review\\n\\n<your review in markdown>"
4. Post the review as a PR comment: gh pr review ${prNumber} --comment --body-file /tmp/review-${prNumber}.md
5. Write a log note to knowledge/logs/prs/pr-${prNumber}.md with YAML frontmatter:
   ---
   title: "PR #${prNumber}: ${prTitle}"
   type: pr
   number: ${prNumber}
   date: <today>
   status: reviewed
   tags: [pr, code-review]
   related: ["[[issue-${prNumber}]]"]
   ---
   Then the review content below.
6. Commit and push the log: git add knowledge/logs/prs/pr-${prNumber}.md && git commit -m "log: PR #${prNumber} reviewed" && git push origin ${prBranch}
7. Type "exit" when done.

Start now.`;

  const terminalId = await createTerminal(tentacleId, prompt);
  const finalState = await pollUntilDone(terminalId);

  console.log(`[octogent-pr] Terminal finished: ${finalState}`);
  if (finalState !== 'exited') process.exit(1);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
