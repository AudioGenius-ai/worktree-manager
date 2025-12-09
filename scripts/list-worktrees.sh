#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BARE_REPO="$ROOT_DIR/.bare-repo"

if [ ! -d "$BARE_REPO" ]; then
    echo "No repository initialized"
    echo "Run: ./scripts/init-repo.sh <repo-url>"
    exit 1
fi

cd "$BARE_REPO"
echo "Worktrees:"
echo ""
git worktree list --porcelain | while read line; do
    if [[ $line == worktree* ]]; then
        path="${line#worktree }"
        echo "  $path"
    elif [[ $line == branch* ]]; then
        branch="${line#branch refs/heads/}"
        echo "    Branch: $branch"
        echo ""
    fi
done
