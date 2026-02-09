# Branch Synchronization Guide

## Overview

This guide provides step-by-step instructions for committing changes, pushing them to remote, and synchronizing all feature branches with the main branch. This is essential for propagating major changes (like infrastructure updates, dependency upgrades, or configuration changes) across all branches in the project.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Understanding the Branch Structure](#understanding-the-branch-structure)
3. [Committing and Pushing Changes](#committing-and-pushing-changes)
4. [Syncing All Branches](#syncing-all-branches)
5. [Verification](#verification)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:
- Git installed and configured
- Write access to the repository
- No uncommitted changes in your working directory (or stash them first)
- Understanding of which branch contains the changes to propagate (usually `main`)

---

## Understanding the Branch Structure

This project uses multiple feature branches:

- **main**: Main development branch (base branch)
- **agent-backend**: Agent service development
- **client-backend**: Client service development
- **transaction-backend**: Transaction service development
- **log-backend**: Log service development
- **frontend**: Frontend React application
- **infrastructure**: Infrastructure and K8s configurations
- **integration**: Integration testing
- **xfactor-backend**: Additional backend features

---

## Committing and Pushing Changes

### Step 1: Check Your Current Branch

```bash
git branch
```

Ensure you're on the correct branch (typically `main` for major changes).

### Step 2: Review Your Changes

```bash
# View modified files
git status

# View actual changes
git diff

# View staged changes
git diff --cached
```

### Step 3: Stage Your Changes

```bash
# Stage specific files
git add path/to/file1 path/to/file2

# OR stage all changes (use with caution)
git add .
```

**Best Practice**: Stage files explicitly rather than using `git add .` to avoid accidentally committing unwanted files.

### Step 4: Commit Your Changes

```bash
git commit -m "type: concise description of changes

Detailed explanation of what changed and why."
```

**Commit Message Guidelines**:
- Use prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, etc.
- Keep the first line under 72 characters
- Provide context in the body for non-trivial changes

### Step 5: Push to Remote

```bash
# Push to the current branch
git push origin <branch-name>

# Example: if you're on main
git push origin main
```

---

## Syncing All Branches

Once your changes are committed and pushed to `main` (or your source branch), follow these steps to propagate them to all feature branches.

### Method 1: Interactive Sync (Recommended for First-Time)

This method syncs all branches one by one, allowing you to handle merge conflicts as they arise.

#### Step 1: Update Your Local Main Branch

```bash
git checkout main
git pull origin main
```

#### Step 2: Get List of All Branches

```bash
git branch -a
```

#### Step 3: Sync Each Feature Branch

For **each** feature branch, run these commands:

```bash
# Switch to the feature branch
git checkout <branch-name>

# Pull latest changes from remote
git pull origin <branch-name>

# Merge changes from main
git merge main

# If there are merge conflicts:
# 1. Review conflicted files with: git status
# 2. Resolve conflicts manually in your editor
# 3. Stage resolved files: git add <resolved-file>
# 4. Complete the merge: git commit

# Push the updated branch
git push origin <branch-name>
```

**Example for agent-backend**:

```bash
git checkout agent-backend
git pull origin agent-backend
git merge main
# Resolve any conflicts if they occur
git push origin agent-backend
```

#### Step 4: Repeat for All Branches

Repeat Step 3 for each branch:
- agent-backend
- client-backend
- transaction-backend
- log-backend
- frontend
- infrastructure
- integration
- xfactor-backend

#### Step 5: Return to Main

```bash
git checkout main
```

---

### Method 2: Automated Sync Script (Advanced)

For frequent syncs without conflicts, you can use this script.

**⚠️ Warning**: This script will fail if there are merge conflicts. Use Method 1 if you expect conflicts.

#### Create Sync Script

Create a file `scripts/sync-all-branches.sh`:

```bash
#!/bin/bash

# Sync all feature branches with main
# Usage: ./scripts/sync-all-branches.sh

set -e  # Exit on any error

# Define branches to sync
BRANCHES=(
    "agent-backend"
    "client-backend"
    "transaction-backend"
    "log-backend"
    "frontend"
    "infrastructure"
    "integration"
    "xfactor-backend"
)

SOURCE_BRANCH="main"
CURRENT_BRANCH=$(git branch --show-current)

echo "=== Branch Sync Tool ==="
echo "Source branch: $SOURCE_BRANCH"
echo "Target branches: ${BRANCHES[@]}"
echo ""

# Update source branch
echo "Updating $SOURCE_BRANCH..."
git checkout "$SOURCE_BRANCH"
git pull origin "$SOURCE_BRANCH"
echo ""

# Sync each branch
for BRANCH in "${BRANCHES[@]}"; do
    echo "=== Syncing $BRANCH ==="

    # Checkout branch
    git checkout "$BRANCH"

    # Pull latest changes
    git pull origin "$BRANCH"

    # Merge from source
    echo "Merging $SOURCE_BRANCH into $BRANCH..."
    if git merge "$SOURCE_BRANCH" --no-edit; then
        echo "✓ Merge successful"

        # Push changes
        git push origin "$BRANCH"
        echo "✓ Pushed to remote"
    else
        echo "✗ Merge conflict detected in $BRANCH"
        echo "Please resolve conflicts manually and run:"
        echo "  git add <resolved-files>"
        echo "  git commit"
        echo "  git push origin $BRANCH"
        exit 1
    fi

    echo ""
done

# Return to original branch
git checkout "$CURRENT_BRANCH"

echo "=== Sync Complete ==="
echo "All branches are now synchronized with $SOURCE_BRANCH"
```

#### Make Script Executable

```bash
chmod +x scripts/sync-all-branches.sh
```

#### Run the Script

```bash
./scripts/sync-all-branches.sh
```

---

### Method 3: PowerShell Script (Windows)

For Windows users, create `scripts/Sync-AllBranches.ps1`:

```powershell
# Sync all feature branches with main
# Usage: .\scripts\Sync-AllBranches.ps1

$ErrorActionPreference = "Stop"

$branches = @(
    "agent-backend",
    "client-backend",
    "transaction-backend",
    "log-backend",
    "frontend",
    "infrastructure",
    "integration",
    "xfactor-backend"
)

$sourceBranch = "main"
$currentBranch = git branch --show-current

Write-Host "=== Branch Sync Tool ===" -ForegroundColor Cyan
Write-Host "Source branch: $sourceBranch"
Write-Host "Target branches: $($branches -join ', ')"
Write-Host ""

# Update source branch
Write-Host "Updating $sourceBranch..." -ForegroundColor Yellow
git checkout $sourceBranch
git pull origin $sourceBranch
Write-Host ""

# Sync each branch
foreach ($branch in $branches) {
    Write-Host "=== Syncing $branch ===" -ForegroundColor Cyan

    # Checkout branch
    git checkout $branch

    # Pull latest changes
    git pull origin $branch

    # Merge from source
    Write-Host "Merging $sourceBranch into $branch..." -ForegroundColor Yellow
    $mergeResult = git merge $sourceBranch --no-edit 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Merge successful" -ForegroundColor Green

        # Push changes
        git push origin $branch
        Write-Host "✓ Pushed to remote" -ForegroundColor Green
    } else {
        Write-Host "✗ Merge conflict detected in $branch" -ForegroundColor Red
        Write-Host "Please resolve conflicts manually and run:"
        Write-Host "  git add <resolved-files>"
        Write-Host "  git commit"
        Write-Host "  git push origin $branch"
        exit 1
    }

    Write-Host ""
}

# Return to original branch
git checkout $currentBranch

Write-Host "=== Sync Complete ===" -ForegroundColor Green
Write-Host "All branches are now synchronized with $sourceBranch"
```

#### Run the PowerShell Script

```powershell
.\scripts\Sync-AllBranches.ps1
```

---

## Verification

After syncing all branches, verify the synchronization:

### Check Branch Status

```bash
# For each branch
git checkout <branch-name>
git log --oneline -5

# Verify latest commits include your changes
```

### Check Remote Status

```bash
# List all branches with their tracking information
git branch -vv

# Check if any branch is ahead/behind
git fetch --all
git branch -vv
```

### Visual Verification

```bash
# View branch graph
git log --graph --oneline --all --decorate -20
```

---

## Troubleshooting

### Merge Conflicts

If you encounter merge conflicts:

1. **Identify conflicted files**:
   ```bash
   git status
   ```

2. **Review conflicts**:
   Open the conflicted files and look for conflict markers:
   ```
   <<<<<<< HEAD
   (current branch code)
   =======
   (main branch code)
   >>>>>>> main
   ```

3. **Resolve conflicts**:
   - Edit the file to keep the desired changes
   - Remove conflict markers
   - Test that the code still works

4. **Complete the merge**:
   ```bash
   git add <resolved-file>
   git commit
   git push origin <branch-name>
   ```

### Diverged Branches

If a branch has diverged significantly from main:

```bash
# Check how far behind/ahead
git checkout <branch-name>
git log main..<branch-name>  # Commits in branch not in main
git log <branch-name>..main  # Commits in main not in branch

# Option 1: Merge (preserves history)
git merge main

# Option 2: Rebase (linear history, cleaner)
git rebase main
# Resolve conflicts one commit at a time
git push origin <branch-name> --force-with-lease
```

**⚠️ Warning**: Only use `--force-with-lease` if you understand the implications and have confirmed with your team.

### Accidentally Pushed Wrong Changes

If you need to undo a push:

```bash
# Undo last commit but keep changes
git reset --soft HEAD~1

# Or undo last commit and discard changes
git reset --hard HEAD~1

# Force push (use with extreme caution)
git push origin <branch-name> --force-with-lease
```

### Branch Is Behind Remote

If your local branch is behind the remote:

```bash
git checkout <branch-name>
git pull origin <branch-name>
```

### Branch Has Uncommitted Changes

If you have uncommitted changes before syncing:

```bash
# Save changes temporarily
git stash save "WIP: description"

# Do your sync operations
# ...

# Restore changes
git stash pop
```

---

## Best Practices

1. **Sync Regularly**: Sync feature branches with main frequently to minimize merge conflicts.

2. **Communicate**: Inform team members before propagating major changes.

3. **Test After Sync**: Run tests after syncing to ensure nothing broke.

4. **Commit Before Sync**: Always commit or stash your changes before syncing.

5. **Use Descriptive Commit Messages**: This helps during conflict resolution.

6. **Review Before Push**: Always review changes before pushing to remote.

7. **Handle Conflicts Immediately**: Don't let merge conflicts accumulate.

8. **Keep Main Stable**: Only merge tested, working code into main.

---

## Quick Reference

### Quick Sync Checklist

- [ ] Commit and push changes to main
- [ ] Pull latest main: `git checkout main && git pull`
- [ ] For each feature branch:
  - [ ] `git checkout <branch>`
  - [ ] `git pull origin <branch>`
  - [ ] `git merge main`
  - [ ] Resolve conflicts if any
  - [ ] `git push origin <branch>`
- [ ] Verify all branches are synced
- [ ] Run tests if applicable

### Common Commands

```bash
# View all branches
git branch -a

# View branch status with tracking info
git branch -vv

# Create new branch from main
git checkout main
git checkout -b new-branch-name

# Delete local branch
git branch -d branch-name

# Delete remote branch
git push origin --delete branch-name

# Fetch all remotes without merging
git fetch --all

# View commit history
git log --oneline --graph --all
```

---

## Related Documentation

- [Git Branching Strategy](../testing/ci/branch-strategy.md)
- [CI/CD Workflows](../testing/ci-cd-workflows.md)
- [Developer Setup](../onboarding/developer-setup.md)

---

## Need Help?

If you encounter issues not covered in this guide:
1. Check the [Troubleshooting Guide](../troubleshooting.md)
2. Ask in the team chat
3. Consult with a senior developer
4. Create an issue in the repository

---

**Last Updated**: 2026-02-09
