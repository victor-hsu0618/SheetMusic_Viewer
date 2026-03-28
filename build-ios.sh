#!/bin/bash
set -e

echo "=== ScoreFlow iOS Build ==="

echo "[1/3] Building web app..."
npm run build

echo "[2/3] Syncing to iOS..."
npx cap sync ios

echo "[3/3] Opening Xcode..."
npx cap open ios
