#!/bin/bash
set -e

REPO_URL="$1"

if [ -z "$REPO_URL" ]; then
    echo "Usage: $0 <repo-url>"
    echo "Example: $0 https://github.com/user/repo.git"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BARE_REPO="$ROOT_DIR/.bare-repo"

if [ -d "$BARE_REPO" ]; then
    echo "Repository already initialized at $BARE_REPO"
    echo "To reinitialize, remove .bare-repo first"
    exit 1
fi

echo "Initializing bare repository..."
git clone --bare "$REPO_URL" "$BARE_REPO"

cd "$BARE_REPO"
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
git fetch origin

mkdir -p "$ROOT_DIR/worktrees"

echo ""
echo "Repository initialized successfully!"
echo "Bare repo: $BARE_REPO"
echo ""
echo "Next steps:"
echo "  ./scripts/create-worktree.sh feature/my-feature"
