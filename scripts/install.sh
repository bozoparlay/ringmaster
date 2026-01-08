#!/bin/bash

# Ringmaster Install Script
# Sets up aliases and local domain for easy development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🎪 Installing Ringmaster..."
echo ""

# Detect shell config file
if [ -n "$ZSH_VERSION" ] || [ -f ~/.zshrc ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ] || [ -f ~/.bashrc ]; then
  SHELL_RC="$HOME/.bashrc"
else
  SHELL_RC="$HOME/.profile"
fi

# Check if aliases already exist
if grep -q "# Ringmaster aliases" "$SHELL_RC" 2>/dev/null; then
  echo "✓ Shell aliases already installed in $SHELL_RC"
else
  echo "Adding shell aliases to $SHELL_RC..."
  cat >> "$SHELL_RC" << EOF

# Ringmaster aliases
ringmaster() {
  cd "$PROJECT_DIR" && npm run dev > /dev/null 2>&1 &
  disown
  echo "🎪 Ringmaster started at http://ringmaster.local:3000"
}

ringmaster-stop() {
  pkill -f "next dev"
  echo "🎪 Ringmaster stopped"
}
EOF
  echo "✓ Added ringmaster and ringmaster-stop aliases"
fi

# Add local domain to /etc/hosts
if grep -q "ringmaster.local" /etc/hosts 2>/dev/null; then
  echo "✓ ringmaster.local already in /etc/hosts"
else
  echo "Adding ringmaster.local to /etc/hosts (requires sudo)..."
  echo "127.0.0.1 ringmaster.local" | sudo tee -a /etc/hosts > /dev/null
  echo "✓ Added ringmaster.local"
fi

# Install npm dependencies
echo ""
echo "Installing dependencies..."
cd "$PROJECT_DIR"
npm install
echo "✓ Dependencies installed"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎪 Ringmaster installed successfully!"
echo ""
echo "To get started:"
echo "  1. Reload your shell:  source $SHELL_RC"
echo "  2. Start the server:   ringmaster"
echo "  3. Open in browser:    http://ringmaster.local:3000"
echo ""
echo "Commands:"
echo "  ringmaster       - Start the dev server (runs in background)"
echo "  ringmaster-stop  - Stop the dev server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
