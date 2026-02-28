#!/usr/bin/env bash
set -e

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ScholarFlow Pipeline Integration Tests                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Prerequisites:"
echo "  • Server running:  npm run dev  (port 5000)"
echo "  • Seed accounts:   T001 / password123"
echo ""

cd "$(dirname "$0")/../.."

echo "Running pipeline tests..."
npx tsx tests/integration/run-pipeline.ts
