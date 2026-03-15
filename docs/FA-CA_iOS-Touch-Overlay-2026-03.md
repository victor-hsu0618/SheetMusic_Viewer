# FA/CA Report: iOS Touch — First Gesture After Stamp Panel Close Unresponsive

**Document ID:** FA-CA-2026-03-01
**Date:** 2026-03-15
**Severity:** Critical (blocks core annotation workflow on iPad)
**Status:** Resolved

---

## 1. Failure Description

### Symptom
On iPad (iOS Safari), after closing the stamp tool panel, the first touch drag on the PDF did nothing. The second drag worked. Additionally, manually switching to Pan mode via the toolbar still left the first drag unresponsive.

### Affected Platform
- iPad / iOS Safari (touch device)
- Desktop (mouse) was unaffected

### User Impact
A musician on stage cannot annotate or scroll their sheet music on the first attempt after closing the stamp panel. This breaks the core performance workflow.

---

## 2. Failure Analysis (FA)

### 2.1 Initial Hypothesis: Smooth Scroll Race Condition
The custom rAF-based smooth scroll engine in `ruler.js` was suspected of fighting native iOS scroll. **Disabling it had no effect.** Smooth scroll was not the cause.

### 2.2 Version Bisect
Git bisect was performed across tagged versions:

| Version | Scroll | Drawing |
|---|---|---|
| v1.0.18-Stable | ✅ works | ✅ works |
| v1.1.2-NewLibrary | N/A (PDF open broken) | N/A |
| v1.1.3 | ❌ fails | ❌ fails |

**Key finding:** v1.0.18-Stable had **no `updateAllOverlaysTouchAction()` function** and **no display/pointer-events manipulation** on overlays. It used `touchstart` listeners with selective `preventDefault()`. The bug was introduced when pointer events + CSS `touch-action` were adopted.

### 2.3 Root Cause — Proximate
When the stamp panel closed, `tools.js` set `activeStampType = 'view'`. This triggered `updateAllOverlaysTouchAction()` which set `display: none` on all `.capture-overlay` elements (on touch devices in view mode). This was intended to make the overlay "invisible" so iOS native scroll could reach the viewer beneath it.

```
Close panel → activeStampType = 'view' → updateAllOverlaysTouchAction()
  → overlay: display:none, viewer: touch-action: pan-x pan-y
  → [user drags] → overlay still hit-tested (stale cache) → touch-action:none → dropped
  → [user drags again] → now works
```

### 2.4 Root Cause — Fundamental: iOS Safari Hit-Testing Cache

**iOS Safari caches hit-test results per gesture frame.** When `display: none` is set on an element via JavaScript during an event handler, the browser does not immediately update its hit-testing tree. The **next touch gesture** is still routed to the (now-hidden) overlay, where `touch-action: none` silently absorbs it. Only the **gesture after that** uses the updated hit-test tree.

This is a known iOS Safari architectural limitation. The cache invalidation happens asynchronously relative to JS execution, making any solution that relies on "hide the overlay, then let touch pass through" fundamentally timing-dependent and unreliable.

### 2.5 Failed Corrective Attempts

| Attempt | Approach | Why It Failed |
|---|---|---|
| Call `updateAllOverlaysTouchAction()` synchronously (no setTimeout) | Immediate `display:none` | iOS hit-test cache still stale for the first gesture |
| Add `requestAnimationFrame` before user interaction | Deferred DOM update | User interacts before the rAF fires |
| Use `pointer-events: none` instead of `display: none` | Keep overlay in layout | iOS may still evaluate `touch-action` on non-pointer-events elements in the painted area; timing still unreliable |
| 100ms setTimeout (friend's approach) | Delayed update | Too late — user's first swipe fires within 100ms of close |
| Overflow/reflow trick (`el.style.overflow = 'hidden'; el.offsetHeight; el.style.overflow = ''`) | Force synchronous layout | Forces layout reflow but **not** hit-test cache invalidation |
| Keep stamp tool active after close (don't revert to 'view') | Overlay stays enabled, no display change | Wrong UX: user wanted navigation mode after close, not drawing mode |

### 2.6 Root Cause — Architectural

The pointer events + CSS `touch-action: none` architecture assumed it was safe to toggle overlay visibility to switch between "drawing mode" and "scroll mode." This assumption is false on iOS Safari due to the hit-test cache. The architecture needed to be redesigned so that the overlay **never changes visibility**.

---

## 3. Corrective Action (CA)

### 3.1 Core Fix: JS-Powered Pan (Always-On Overlay)

The overlay is now **always present and always receives pointer events**. View mode panning is handled entirely in JavaScript (mirroring the existing mouse pan implementation), instead of relying on native iOS scroll.

```
Before: Overlay hidden in view mode → native iOS scroll via viewer
After:  Overlay always visible → JS scroll (viewer.scrollTop/Left) in view mode
```

This eliminates the hit-testing race condition entirely. No DOM visibility changes occur on tool switch.

### 3.2 Files Modified

#### `src/modules/annotation/InteractionManager.js`

**`startAction()` — added touch pan for view mode:**
```javascript
if (toolType === 'view') {
    if (isPanning) return; // ignore second touch
    isPanning = true;
    const startX = e.clientX, startY = e.clientY;
    const startScrollTop = this.app.viewer.scrollTop;
    const startScrollLeft = this.app.viewer.scrollLeft;
    // ... pointermove updates viewer.scrollTop/Left
    // ... pointerup cleans up
    return;
}
```

**`updateAllOverlaysTouchAction()` — simplified:**
Removed all `display` / `pointer-events` manipulation. Now only syncs `data-active-tool` attribute (for CSS cursors) and resets `isInteracting` on view mode entry. No more touching overlay visibility.

#### `src/styles/interaction.css`

`.capture-overlay` now always has `touch-action: none` (previously had `pan-x pan-y` default, with per-tool overrides). Removed all view-mode overlay CSS rules (`pointer-events: none`, `display: none`, `touch-action: auto` overrides for view mode).

#### `src/modules/tools.js`

Palette close handler: calls `updateAllOverlaysTouchAction()` immediately (synchronous) for `data-active-tool` sync, plus deferred cleanup (50ms). The immediate call previously needed to set `display:none` reliably; now it is simply a state-sync call.

#### `src/modules/ruler.js`

`stopJump()` helper added (new). Smooth scroll (`easeInOutCubic` rAF engine) restored after being disabled for diagnostic purposes.

---

## 4. Known Trade-offs (Accepted)

| Behavior | Before | After |
|---|---|---|
| iOS momentum scroll | Native (rubber-band, deceleration) | JS scroll (instant stop on lift) |
| Pinch-to-zoom gesture | Worked in view mode when overlay was hidden | Blocked — use toolbar +/- buttons |
| First-touch reliability | Unreliable (timing-dependent) | Always reliable |
| Drawing after close | Broken (first touch dropped) | N/A — view mode on close |
| Two-finger touch | Second finger could conflict | Guarded by `isPanning` check |

### Momentum Scroll
Native iOS momentum scroll (the physics-based deceleration after a fast swipe) is not replicated in the JS pan. This is cosmetically noticeable but functionally acceptable for a music annotation app where precise page navigation is more important than scroll feel.

If momentum scroll becomes a priority, it can be implemented by sampling velocity in the last few `pointermove` events before `pointerup` and running a decelerating rAF loop. Estimated effort: medium.

### Pinch-to-Zoom
Pinch-to-zoom via gesture was only reliable when the overlay was hidden (view mode), which itself was unreliable. It was completely blocked in all stamp modes. The net regression is minor. Native gesture zoom can be re-implemented in JS by tracking two `pointerId` values and computing distance delta. Estimated effort: medium-high.

---

## 5. Prevention

### Why This Class of Bug Is Hard to Catch
iOS Safari hit-testing cache behavior is not documented and not reproducible in desktop browsers or iOS simulators (simulators use mouse events). It only manifests on physical iPad hardware, making it invisible to automated testing.

### Lessons Learned
1. **Never rely on DOM visibility toggling to control touch routing on iOS.** `display:none` and `pointer-events:none` changes are not instantaneous with respect to touch hit-testing.
2. **Keep overlays always active.** Handle mode switching in JS event logic, not in DOM visibility state.
3. **`touch-action: none` + pointer events is the only reliable cross-mode annotation approach.** All gestures go through JS; JS decides what to do based on current tool.
4. **Test on physical iPad hardware** for any touch interaction changes. The iOS Simulator does not reproduce this class of bug.

---

## 6. Related Commits

```
fccb170  fix(interaction): resolve trash bin visibility and closure-bound coordination issues
552c1ed  fix(interaction): restore trash bin visibility during stamp movement
7f6e54d  fix(touch): resolve stamp tool failure and refine first-touch logic
bb5e5a3  fix(touch): resolve iPad first-touch interaction failures
```

The fix described in this document was applied on top of these commits on branch `main`.
