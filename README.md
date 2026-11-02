# ai-lab

An issue-driven, multi-agent fix-and-review pipeline for a GitHub repository.
Open an issue and an agent proposes a fix as a pull request. A second agent
reviews that pull request and posts its review. Every run is logged to a
markdown knowledge vault in the repo, so the history stays searchable.

```
issue opened ──► Issue Agent ──► branch fix/issue-N ──► pull request
                                                            │
                         review comment ◄── PR Reviewer ◄───┘
                                │
                                └──► knowledge/logs/{issues,prs}/*.md
```

## How it works

Two GitHub Actions workflows drive everything:

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/issue-agent.yml` | issue opened | Hands the issue to an agent that works on branch `fix/issue-N` and opens a PR |
| `.github/workflows/pr-review.yml` | PR opened from a `fix/issue-*` branch | Runs a reviewer agent and posts the result as a PR review comment |

There are two interchangeable back ends for the agents, both in `scripts/`:

- **Direct API** (`issue-agent.js`, `pr-reviewer.js`): reads up to ~30 files /
  30k characters of repo context, asks Claude for a JSON patch (or a review),
  applies it, and opens the PR with `gh`. Small and easy to read.
- **Octogent** (`octogent-trigger.js`, `octogent-pr-trigger.js`): drives a
  [Claude Code](https://code.claude.com) agent in a git worktree through a local
  Octogent server and polls until it finishes (30 min timeout). The workflows
  use this variant by default.

`scripts/lib/obsidian.js` writes one note per issue and per PR under
`knowledge/logs/` and keeps `knowledge/INDEX.md` up to date. The folder is a
plain Obsidian-compatible vault, but nothing requires Obsidian.

## Setup

Requirements: Node 20+, the [`gh` CLI](https://cli.github.com), `git`, and a
self-hosted GitHub Actions runner.

```bash
git clone https://github.com/wpu-research/ai-lab
cd ai-lab
npm install
```

Repository settings:

- Secret `ANTHROPIC_API_KEY` for the direct API back end.
- Optional secret `PAT_TOKEN` if PRs opened by the agent must trigger other
  workflows (the default `GITHUB_TOKEN` does not).
- For the Octogent back end, a running Octogent server (`OCTOGENT_API`,
  default `http://127.0.0.1:8787`).

Try the direct back end locally against a real issue:

```bash
export ANTHROPIC_API_KEY=...
ISSUE_NUMBER=1 ISSUE_TITLE="Fix typo in README" ISSUE_BODY="..." npm run issue-agent
PR_NUMBER=2 npm run pr-reviewer
```

## Security: read before enabling on a public repository

The workflows run on a **self-hosted runner** and are triggered by issues. On a
public repository anyone can open an issue, and the issue text becomes the
agent's prompt. That makes this a prompt-injection surface on a machine you
control. Before enabling it on a public repo:

- Restrict who can trigger it (for example, only run when the issue author has
  `OWNER`/`MEMBER` association, or require a maintainer-applied label).
- Run the runner in a disposable container or VM with no access to secrets or
  other repositories, and set "Require approval for all outside collaborators"
  for workflows.
- Review every agent PR before merging. The agents propose changes; they should
  not be trusted to merge.

## Status

Early and experimental. `app/` (a knowledge assistant UI) and RAG indexing under
`scripts/` are placeholders and not implemented yet.

## Contributing

Issues and pull requests are welcome. Please keep changes small and include how
you tested them.

## License

[MIT](LICENSE)
