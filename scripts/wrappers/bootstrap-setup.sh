#!/usr/bin/env bash
# Bootstrap script to ensure Python is available before running pipelines

set -euo pipefail

echo ""
echo "========================================"
echo "   Python Prerequisite Check"
echo "========================================"
echo ""

# Check if Python is installed
if command -v python3 &> /dev/null; then
    echo "[OK] Python found"
    python3 --version
    echo ""
    echo "Running developer setup..."
    exec python3 "$(dirname "$0")/../pipelines/setup_dev_env.py" "$@"
elif command -v python &> /dev/null; then
    echo "[OK] Python found"
    python --version
    echo ""
    echo "Running developer setup..."
    exec python "$(dirname "$0")/../pipelines/setup_dev_env.py" "$@"
fi

# Python not found - show installation instructions
echo "[ERROR] Python not found!"
echo ""
echo "This project's build scripts require Python 3.8 or higher."
echo ""
echo "========================================"
echo "   How to Install Python"
echo "========================================"
echo ""

# OS-specific instructions
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macOS - Using Homebrew (Recommended):"
    echo "  brew install python@3.12"
    echo ""
    echo "macOS - Using official installer:"
    echo "  https://www.python.org/downloads/"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Ubuntu/Debian:"
    echo "  sudo apt update"
    echo "  sudo apt install python3 python3-pip python3-venv"
    echo ""
    echo "Fedora/RHEL:"
    echo "  sudo dnf install python3 python3-pip"
    echo ""
    echo "Arch Linux:"
    echo "  sudo pacman -S python python-pip"
else
    echo "Please install Python 3.8+ from:"
    echo "  https://www.python.org/downloads/"
fi

echo ""
echo "========================================"
echo ""
echo "After installation:"
echo "  1. Close and reopen this terminal"
echo "  2. Run this script again"
echo ""

exit 1
