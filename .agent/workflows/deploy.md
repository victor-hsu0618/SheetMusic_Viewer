---
description: deploy to GitHub Pages (merge main into v1.0.0-dev and push)
---

This workflow publishes the current state of `main` to GitHub Pages by merging it into the `v1.0.0-dev` deployment branch.

// turbo-all
1. Merge main into v1.0.0-dev and push to trigger GitHub Pages deployment:
```
git checkout v1.0.0-dev && git merge main --no-edit && git push origin v1.0.0-dev && git checkout main
```
