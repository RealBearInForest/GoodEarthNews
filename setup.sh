#!/bin/bash
set -e

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        Good Earth News — Setup Script        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Check for node
if ! command -v node &> /dev/null; then
  echo "❌  Node.js not found. Install it first:"
  echo ""
  echo "  Option A (Homebrew):  brew install node"
  echo "  Option B (installer): https://nodejs.org/en/download"
  echo ""
  exit 1
fi

NODE_VERSION=$(node --version)
echo "✅  Node.js $NODE_VERSION found"

# Set up API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
  if [ ! -f backend/.env ]; then
    echo ""
    echo "⚠️   ANTHROPIC_API_KEY not set."
    echo "    The site works without it (using demo articles),"
    echo "    but you need it to fetch live news with AI filtering."
    echo ""
    echo "    To enable AI news filtering:"
    echo "    1. Get a key at https://console.anthropic.com"
    echo "    2. Create backend/.env with: ANTHROPIC_API_KEY=your_key_here"
    echo ""
  fi
else
  echo "✅  ANTHROPIC_API_KEY found"
  echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" > backend/.env
  echo "PORT=3001" >> backend/.env
fi

# Install dependencies
echo ""
echo "📦  Installing dependencies..."
npm install
npm install --prefix backend
npm install --prefix frontend

echo ""
echo "✅  Setup complete!"
echo ""
echo "🚀  To start the app:"
echo "    npm start"
echo ""
echo "    → Globe Explorer:  http://localhost:5173"
echo ""
