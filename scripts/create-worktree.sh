#!/bin/bash
set -e

BRANCH_NAME="$1"
WORKTREE_DIR="$2"

if [ -z "$BRANCH_NAME" ]; then
    echo "Usage: $0 <branch-name> [directory-name]"
    echo "Example: $0 feature/auth"
    echo "Example: $0 feature/auth auth-work"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BARE_REPO="$ROOT_DIR/.bare-repo"
WORKTREES_DIR="$ROOT_DIR/worktrees"

if [ ! -d "$BARE_REPO" ]; then
    echo "Error: Repository not initialized"
    echo "Run: ./scripts/init-repo.sh <repo-url>"
    exit 1
fi

if [ -z "$WORKTREE_DIR" ]; then
    WORKTREE_DIR=$(echo "$BRANCH_NAME" | tr '/' '-')
fi

WORKTREE_PATH="$WORKTREES_DIR/$WORKTREE_DIR"

if [ -d "$WORKTREE_PATH" ]; then
    echo "Worktree already exists: $WORKTREE_PATH"
    exit 1
fi

cd "$BARE_REPO"
git fetch origin

if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null || \
   git show-ref --verify --quiet "refs/remotes/origin/$BRANCH_NAME" 2>/dev/null; then
    echo "Creating worktree from existing branch: $BRANCH_NAME"
    git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
    DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
    echo "Creating new branch '$BRANCH_NAME' from origin/$DEFAULT_BRANCH"
    git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "origin/$DEFAULT_BRANCH"
fi

echo ""
echo "Worktree created successfully!"
echo "Location: $WORKTREE_PATH"
echo "Branch: $BRANCH_NAME"
echo ""
echo "To work in this worktree:"
echo "  cd $WORKTREE_PATH"
