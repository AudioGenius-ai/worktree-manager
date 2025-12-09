#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BARE_REPO="$ROOT_DIR/.bare-repo"

if [ ! -d "$BARE_REPO" ]; then
    echo "Error: Repository not initialized"
    exit 1
fi

cd "$BARE_REPO"
echo "Fetching latest from remote..."
git fetch origin --prune

echo ""
echo "All worktrees synced with remote"
echo "Run 'git pull' in individual worktrees to update them"
