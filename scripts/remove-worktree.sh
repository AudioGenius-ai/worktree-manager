#!/bin/bash
set -e

WORKTREE_NAME="$1"

if [ -z "$WORKTREE_NAME" ]; then
    echo "Usage: $0 <worktree-name>"
    echo "Example: $0 feature-auth"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BARE_REPO="$ROOT_DIR/.bare-repo"
WORKTREE_PATH="$ROOT_DIR/worktrees/$WORKTREE_NAME"

if [ ! -d "$BARE_REPO" ]; then
    echo "Error: Repository not initialized"
    exit 1
fi

if [ ! -d "$WORKTREE_PATH" ]; then
    echo "Error: Worktree not found: $WORKTREE_PATH"
    exit 1
fi

cd "$BARE_REPO"

echo "Removing worktree: $WORKTREE_PATH"
git worktree remove "$WORKTREE_PATH"

echo "Worktree removed successfully"
