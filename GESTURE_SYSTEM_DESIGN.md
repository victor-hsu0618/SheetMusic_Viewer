# ScoreFlow 手勢系統設計文件

## 目錄
1. [系統概覽](#系統概覽)
2. [核心架構](#核心架構)
3. [手勢類型](#手勢類型)
4. [事件流程](#事件流程)
5. [狀態管理](#狀態管理)
6. [平台適應](#平台適應)
7. [性能考慮](#性能考慮)
8. [交互設計](#交互設計)

---

## 系統概覽

**GestureManager** 是 ScoreFlow 的核心手勢系統，負責處理：
- 🎯 **觸控手勢**：單指/雙指觸控、滑動、點擊
- 🖱️ **鼠標輸入**：滾輪縮放、拖曳平移
- 📱 **移動特定**：Bottom Sheet 拖曳、Zone Tap（區域點擊）
- ⌚ **平台差異**：iPad Safari、macOS、Android 等

**核心特性：**
- 手勢衝突偵測（pinch vs. scroll vs. pan）
- 平台適應（觸控密度、DPI、輸入延遲）
- 可自訂的行為（skipAnchors、速度、靈敏度）
- 視覺反饋（Zone Indicator 動畫）

---

## 核心架構

### 模組結構

```
GestureManager (410 行)
├─ initBottomSheetGestures()      [Mobile Bottom Sheet]
├─ initViewerGestures()           [Main Viewer Events]
│  ├─ touchstart handler          [初始化手勢]
│  ├─ touchmove handler           [即時追蹤 & 衝突偵測]
│  ├─ touchend handler            [手勢確認 & 導航]
│  ├─ wheel handler               [鼠標滾輪縮放]
│  └─ touchcancel handler         [手勢取消]
├─ handleZoneTap(tapX, tapY)      [Zone 區域判定 & 導航]
├─ showZoneIndicator()             [視覺反饋動畫]
└─ [狀態管理模組]
   ├─ Pinch 狀態
   ├─ Pan/Swipe 狀態
   ├─ 時間限制器
   └─ 手勢鎖定機制
```

### 狀態變數清單

```javascript
// 捏合（Pinch）狀態
this._isPinching = false              // Pinch 進行中
this._initialDistance = 0              // 初始距離 (px)
this._initialScale = 1                 // 初始縮放比例
this._pinchCenterX/Y = 0               // 捏合中心座標
this._lastPinchX/Y = 0                 // 上一次位置

// 平移（Pan）狀態
this._startX/Y = 0                     // 觸控起點
this._startTime = 0                    // 觸控時間戳
this._gestureLocked = null             // 'pinch' | 'pan' | null

// 時間控制
this._suppressSingleTouchUntil = 0    // 抑制單指時間戳
this._lastZoneTapAt = 0                // 上次 Zone Tap 時間

// 其他狀態
this._potentialSwipeUp = false         // 垂直模式潛在上滑
this._lastMobilePanelId = null         // Bottom Sheet 追蹤
```

---

## 手勢類型

### 1️⃣ 雙指捏合縮放（Pinch Zoom）

**觸發條件：**
```
├─ 觸控點數 >= 2
├─ 兩點距離變化 > 35px
├─ app.pinchZoomEnabled === true
└─ 時間 > 100ms（防誤觸）
```

**完整流程：**

```
┌─ touchstart (2+ fingers)
│  ├─ 記錄初始距離：Math.hypot(x2-x1, y2-y1)
│  ├─ 計算中心點：{(x1+x2)/2, (y1+y2)/2}
│  ├─ _initialScale = 1
│  └─ _isPinching = false （待確認）
│
├─ touchmove (持續)
│  ├─ 計算新距離
│  ├─ distDelta = |newDist - initDist|
│  ├─ if (distDelta > 35px && pinchZoomEnabled)
│  │  ├─ _isPinching = true
│  │  ├─ _gestureLocked = 'pinch' （鎖定手勢）
│  │  ├─ scaleFactor = newDist / initDist
│  │  ├─ 設定 transform-origin = 捏合中心
│  │  └─ 應用 CSS transform: scale(scaleFactor)
│  │
│  └─ 其他情況：忽略或作為 pan
│
└─ touchend / touchcancel
   ├─ if (_isPinching)
   │  ├─ scaleFactor = finalDist / initDist
   │  ├─ zoomDelta = (scaleFactor - 1) * 0.5 （阻尼）
   │  ├─ viewerManager.changeZoom(zoomDelta)
   │  ├─ 焦點還原：_captureFocalPoint() → _restoreFocalPoint()
   │  └─ _suppressSingleTouchUntil = now + 100 （防殘留）
   │
   └─ 清理所有 Pinch 狀態
```

**代碼核心：**
```javascript
// touchstart
const dist = Math.hypot(
    touches[1].clientX - touches[0].clientX,
    touches[1].clientY - touches[0].clientY
)
this._initialDistance = dist
this._pinchCenterX = (touches[0].clientX + touches[1].clientX) / 2
this._pinchCenterY = (touches[0].clientY + touches[1].clientY) / 2

// touchmove
const newDist = Math.hypot(...)
const distDelta = Math.abs(newDist - this._initialDistance)
if (distDelta > 35) {
    this._isPinching = true
    this._gestureLocked = 'pinch'
    const scale = newDist / this._initialDistance
    container.style.transform = `scale(${scale})`
}

// touchend
const finalScale = finalDist / this._initialDistance
const zoomDelta = (finalScale - 1) * 0.5
this.app.viewerManager?.changeZoom(zoomDelta)
```

**特殊處理：**
- ✅ **焦點保留**：縮放後保持視覺中心
- ✅ **阻尼 0.5x**：避免過度敏感
- ✅ **時間延遲**：確保 > 35px 才啟動（防誤觸）
- ✅ **手勢鎖定**：一旦判定為 Pinch，忽略其他類型

---

### 2️⃣ 單指滑動翻頁（Page Swipe）

**觸發條件（水平模式）：**
```
├─ 觸控點數 === 1
├─ 水平移動 > 30px
├─ 垂直移動 < 30px （濾除噪音）
├─ 時間 < 500ms （快速滑動）
└─ 未被 pinch/pan 鎖定
```

**流程圖：**
```
┌─ touchstart
│  ├─ _startX = touches[0].clientX
│  ├─ _startY = touches[0].clientY
│  ├─ _startTime = Date.now()
│  └─ _gestureLocked = null
│
├─ touchmove (連續追蹤)
│  ├─ deltaX = currentX - _startX
│  ├─ deltaY = currentY - _startY
│  ├─ absDeltaX = Math.abs(deltaX)
│  ├─ absDeltaY = Math.abs(deltaY)
│  │
│  ├─ if (absDeltaX > absDeltaY) 
│  │  ├─ 可能是水平滑動
│  │  ├─ if (absDeltaX > 30px && _gestureLocked === null)
│  │  │  └─ _gestureLocked = 'pan' （鎖定！）
│  │  │
│  │  └─ else if (absDeltaY > 30px)
│  │     └─ 判定為垂直捲動，_gestureLocked = 'scroll'
│  │
│  └─ 此後忽略其他軸向
│
└─ touchend
   ├─ if (_gestureLocked === 'pan')
   │  ├─ direction = deltaX > 0 ? 'left' : 'right'
   │  ├─ duration = Date.now() - _startTime
   │  ├─ velocity = Math.abs(deltaX) / duration
   │  │
   │  ├─ if (velocity > 0.5 px/ms OR deltaX > 50px)
   │  │  ├─ 觸發翻頁
   │  │  ├─ direction === 'left' → jumpManager.prevPage()
   │  │  └─ direction === 'right' → jumpManager.nextPage()
   │  │
   │  └─ else
   │     └─ 取消（Snap Back）
   │
   └─ 清理 pan 狀態
```

**參數配置：**
```javascript
const SWIPE_DISTANCE_THRESHOLD = 30    // 最少 30px 啟動
const SWIPE_VELOCITY_THRESHOLD = 0.5   // px/ms
const SWIPE_TIME_THRESHOLD = 500       // 最多 500ms
const AXIS_THRESHOLD = 30              // 軸向判定
```

**動畫行為：**
```javascript
// 垂直模式中的 Page Swipe
isHorizontal ? 'instant' : 'smooth'

// 水平模式根據過渡風格
transitionStyle === 'slide' ? 'smooth' : 'instant'
```

---

### 3️⃣ 區域點擊導航（Zone Tap）

**視口分區：**
```
┌─────────────┬─────────────┬─────────────┐
│ Up 33%      │ Up 33%      │ Up 33%      │  
├─────────────┼─────────────┼─────────────┤
│ Left 33%    │ Center      │ Right 33%   │  
├─────────────┼─────────────┼─────────────┤
│ Down 33%    │ Down 33%    │ Down 33%    │  
└─────────────┴─────────────┴─────────────┘

Left Zone   → Prev Page
Right Zone  → Next Page
Up/Down     → Context 相關
```

**觸發條件：**
```
├─ 觸控時間 < 200ms （短點擊）
├─ 移動距離 < 10px （基本靜止）
├─ 未在進行 pinch/pan （_gestureLocked === null）
├─ 距上次 Zone Tap > 350ms （防連擊）
└─ 在可點擊區域（非邊界）
```

**區域判定邏輯：**
```javascript
handleZoneTap(tapX, tapY) {
    const width = this.app.viewer.clientWidth
    const height = this.app.viewer.clientHeight
    
    // 水平分區
    const zoneX = tapX < width / 3 ? 'left'
                : tapX > 2 * width / 3 ? 'right'
                : 'center'
    
    // 垂直分區
    const zoneY = tapY < height / 3 ? 'up'
                : tapY > 2 * height / 3 ? 'down'
                : 'center'
    
    const isHorizontal = this.app.readingMode === 'horizontal'
    
    // 執行行為
    if (isHorizontal) {
        if (zoneX === 'left') this.app.jumpManager?.prevPage()
        if (zoneX === 'right') this.app.jumpManager?.nextPage()
    } else {
        if (zoneY === 'up') this.app.jumpManager?.prevPage()
        if (zoneY === 'down') this.app.jumpManager?.nextPage()
    }
}
```

**防連擊機制：**
```javascript
const now = Date.now()
if (now - this._lastZoneTapAt < 350) return
this._lastZoneTapAt = now
```

**視覺反饋：**
```
showZoneIndicator(type, x, y, isLimit=false)
  ├─ 建立臨時 DOM 元素
  ├─ class: `tap-zone-indicator ${type}${isLimit ? ' limit' : ''}`
  ├─ 樣式：
  │  ├─ 成功(綠)：background: rgba(34, 197, 94, 0.7)
  │  ├─ 失敗(紅)：background: rgba(239, 68, 68, 0.7)
  │  └─ 內容：箭頭 (→) 或 X (✕)
  │
  ├─ 位置：點擊座標附近（+20px offset）
  ├─ 尺寸：64x64px (CSS border-radius: 50%)
  ├─ 動畫：
  │  ├─ 淡入：0ms
  │  ├─ 停留：200ms
  │  └─ 淡出：0-300ms (opacity: 1 → 0)
  │
  └─ 自動移除：300ms 後 remove()
```

---

### 4️⃣ 鼠標滾輪縮放（Wheel Zoom）

**觸發：**
```
wheel event (+ Cmd/Ctrl)
  ├─ macOS: Cmd + 捲動
  ├─ Windows/Linux: Ctrl + 捲動
  └─ Chrome: Cmd/Ctrl 預設綁定
```

**實現：**
```javascript
viewerContainer.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return
    
    e.preventDefault()
    
    // 標準化 deltaY
    let delta = -e.deltaY * 0.01  // 約 ±0.5 for normal scroll
    
    // macOS trackpad 特別敏感，需要阻尼
    const isMac = /Mac/.test(navigator.userAgent)
    if (isMac) {
        delta *= 0.2  // 減少 80%
    }
    
    this.app.viewerManager?.changeZoom(delta)
})
```

**平台差異：**
```
macOS Trackpad:
  ├─ 連續事件 (滑順)
  ├─ deltaY 非常大 (-50 ~ +50)
  ├─ 需要 0.2x 阻尼
  └─ 用戶期望：細微控制

Windows/Linux Scroll Wheel:
  ├─ 離散事件 (跳躍)
  ├─ deltaY 標準化 (±120)
  ├─ 原生阻尼已內建
  └─ 用戶期望：快速變焦
```

---

### 5️⃣ Bottom Sheet 手勢（移動特定）

**場景：** Jump Panel 在移動設備作為浮動面板（< 600px 寬）

**手勢：**
1. **下滑關閉**：向下拖曳面板超過 100px → 關閉
2. **上滑開啟**：（已禁用，與原生捲動衝突）

**完整流程：**
```
┌─ touchstart (.jump-drag-handle)
│  ├─ if (window.innerWidth > 600) return （寬屏無此手勢）
│  ├─ _startY = e.touches[0].clientY
│  ├─ activePanel = panel
│  ├─ isDraggingGesture = true
│  └─ panel.style.transition = 'none' （禁用動畫）
│
├─ touchmove (連續)
│  ├─ currentY = e.touches[0].clientY
│  ├─ deltaY = currentY - _startY
│  ├─ if (deltaY > 0) （下滑）
│  │  ├─ 更新面板位置：translateY(deltaY)
│  │  ├─ 計算透明度：opacity = 1 - (deltaY / 200)
│  │  └─ 背景模糊：backdrop-filter: blur(Math.max(0, 25 - deltaY))
│  │
│  └─ 視覺跟蹤用戶手指
│
└─ touchend
   ├─ 計算最終狀態
   ├─ duration = Date.now() - _startTime
   ├─ velocity = deltaY / duration
   │
   ├─ if (deltaY > 100px OR velocity > 0.5px/ms)
   │  ├─ 動畫關閉（100% 滑出）
   │  ├─ panel.style.transform = 'translateY(100%)'
   │  ├─ panel.style.transition = '0.3s cubic-bezier(0.4, 0, 0.2, 1)'
   │  └─ 300ms 後移除或隱藏
   │
   └─ else
      ├─ 動畫返回原位
      ├─ panel.style.transform = 'translateY(0)'
      ├─ panel.style.transition = '0.2s ease-out'
      └─ _startY 重置
```

---

## 事件流程

### 完整觸控事件流圖

```
user touches screen
        ↓
[touchstart] event fires
    ├─ 記錄初始狀態：position, time, touchCount
    ├─ Calculate if possible pinch (touches.length >= 2)
    └─ Initialize gesture state machine
        ↓
[touchmove] events (100-500ms continuous)
    ├─ Calculate deltas: ΔX, ΔY
    ├─ Update metrics every frame
    ├─ Determine gesture type:
    │   ├─ [2+ fingers & distance change > 35px]
    │   │   └─ → Pinch Zoom (lock gesture)
    │   ├─ [1 finger & |ΔX| > |ΔY|]
    │   │   └─ → Horizontal Pan (lock gesture)
    │   ├─ [1 finger & |ΔY| > |ΔX|]
    │   │   └─ → Vertical Scroll (native)
    │   └─ Lock: _gestureLocked = type
    │
    ├─ Apply visual transform based on gesture
    │   ├─ Pinch: CSS scale() + transform-origin
    │   ├─ Pan: defer to native scroll or custom transform
    │   └─ Scroll: native browser behavior
    │
    └─ Update UI (zoom preview, etc.)
        ↓
[touchend] / [touchcancel] event fires
    ├─ Calculate final metrics:
    │   ├─ Total distance: √(ΔX² + ΔY²)
    │   ├─ Velocity: distance / time
    │   ├─ Direction: atan2(ΔY, ΔX)
    │   └─ Duration: time elapsed
    │
    ├─ Execute action based on _gestureLocked:
    │   ├─ 'pinch' → viewerManager.changeZoom(delta)
    │   ├─ 'pan' → jumpManager.prevPage() / nextPage()
    │   ├─ null → handleZoneTap() or Zone detection
    │   └─ 'scroll' → native scroll (no action)
    │
    ├─ Apply final animations/snapping
    ├─ Set _suppressSingleTouchUntil
    └─ Clear all gesture state
        ↓
idle (ready for next gesture)
```

### 事件優先級（決定手勢類型）

```
高優先級（快速判定）:
1. Pinch Zoom
   └─ 條件：2+ fingers && distance change > 35px
   
2. Horizontal Pan
   └─ 條件：1 finger && |ΔX| > |ΔY| + threshold
   
3. Vertical Scroll (Native)
   └─ 條件：1 finger && |ΔY| > |ΔX| + threshold
   
低優先級（需要 touchend 確認）:
4. Zone Tap
   └─ 條件：< 200ms && distance < 10px
   
5. Swipe Navigation
   └─ 條件：velocity > 0.5px/ms && distance > 50px
```

---

## 狀態管理

### 手勢狀態機

```
[IDLE]
  ↓ touchstart
[PENDING]
  ├─ 等待 touchmove 確認手勢類型
  ├─ 記錄起點、時間
  └─ 初始化 Pinch 計算
    ↓ touchmove
  ├─ 分析位移、距離、方向
  └─ 判斷手勢類型
    ↓
[PINCHING] ← 2+ fingers && distance > 35px
  ├─ 即時縮放預覽（CSS scale）
  ├─ 更新中心點
  └─ touchend → 應用最終 zoom
    ↓
[PANNING] ← 1 finger && horizontal dominant
  ├─ 鎖定手勢類型
  ├─ 計算滑動方向 & 速度
  └─ touchend → 判定翻頁 vs. 取消
    ↓
[SCROLLING] ← 1 finger && vertical dominant
  ├─ 原生捲動（未攔截）
  └─ touchend → 判定 Zone Tap
    ↓
[IDLE] ← cleanup
  └─ 清理所有狀態變數
```

### 時間控制機制

```javascript
// 防連擊（debounce）
_lastZoneTapAt
├─ 記錄上次成功 Zone Tap 時間戳
└─ 新 Tap 若在 350ms 內 → 忽略

// 抑制殘留事件（throttle）
_suppressSingleTouchUntil
├─ 在 Pinch/Multi-touch 結束時設定
├─ 時間戳 = now + 100ms
└─ 新的單指 touchend 若在時間內 → 忽略

// 短/長按判定
duration = Date.now() - _startTime
if (duration < 200ms && distance < 10px)
  → Zone Tap
else if (velocity > 0.5px/ms && distance > 50px)
  → Swipe Navigation
else
  → Scroll / Cancel
```

---

## 平台適應

### 平台特性對照表

| 平台 | 觸控原生 | 滾輪支持 | 精度 | 特殊處理 |
|------|---------|---------|------|----------|
| **iPad Safari** | ✅ | ✖️ | 高 | 雙手軌跡追蹤、防 rubber-band |
| **macOS (Safari/Chrome)** | 觸控板 | ✅ 敏感 | 超高 | 0.2x 阻尼、scroll-snap |
| **Android (Chrome)** | ✅ 原生 | ✖️ | 中 | dp→px 單位轉換 |
| **Chrome Desktop** | ✖️ | ✅ 標準 | 高 | 0.01x 標準化 |
| **Firefox** | 部分 | ✅ | 中 | 相容性測試 |

### 平台檢測 & 適應代碼

```javascript
// 平台檢測
const isIpad = /iPad|Mac OS X/.test(navigator.userAgent) && 'ontouchend' in document
const isMac = /Mac/.test(navigator.userAgent)
const isAndroid = /Android/.test(navigator.userAgent)
const isChrome = /Chrome/.test(navigator.userAgent)

// 阻尼因子調整
let dampingFactor = 1.0
if (isMac) dampingFactor = 0.2     // Trackpad 特別敏感
if (isAndroid) dampingFactor = 0.8 // Android 標準
if (isChrome && !isMac) dampingFactor = 0.5

// 觸控工作區調整
let minTouchTarget = 44  // iPad 標準
if (isAndroid) minTouchTarget = 48 // Material Design
if (window.innerWidth < 600) minTouchTarget = 44 // 手機預設

// Scroll-snap 行為
if (isMac && isHorizontal) {
    viewer.style.scrollSnapType = 'x mandatory'  // 自動吸附
} else {
    viewer.style.scrollSnapType = 'none'  // 禁用
}
```

### 響應式 Zone 尺寸

```javascript
const width = this.app.viewer.clientWidth
const height = this.app.viewer.clientHeight

// 寬屏設備
if (width > 800) {
    zoneWidth = width / 3       // 每個 Zone 占 1/3
    zoneHeight = height / 3
}
// 手機
else {
    // 為了手指舒適性，Zone 可能更大
    zoneWidth = Math.max(80, width / 3)
    zoneHeight = Math.max(80, height / 3)
}
```

---

## 性能考慮

### 事件節流（Throttling）

```javascript
// Zone Tap 防連擊
const ZONE_TAP_DEBOUNCE = 350  // ms
if (now - this._lastZoneTapAt < ZONE_TAP_DEBOUNCE) return

// 雙手追蹤更新頻率
let updateCounter = 0
touchmove: {
    if (++updateCounter % 2 === 0) {
        // 只在偶數幀更新 _lastPinchX/Y
        this._lastPinchX = currentX
        this._lastPinchY = currentY
    }
}
```

### 手勢衝突迴避

```javascript
// 1. 手勢鎖定 (Gesture Locking)
//    一旦鎖定為 Pinch，忽略所有 Pan 事件
if (this._gestureLocked === 'pinch') {
    if (event is Pan) return  // 忽略
}

// 2. 時間基抑制 (Time-based Suppression)
//    Pinch 結束後短時間內，忽略單指 touchend
this._suppressSingleTouchUntil = Date.now() + 100
if (now < this._suppressSingleTouchUntil && touches.length === 1) {
    return  // 忽略殘留事件
}

// 3. 軸向判定 (Axis Locking)
//    確認手勢方向後，忽略垂直軸的信號
if (Math.abs(deltaX) > Math.abs(deltaY)) {
    _gestureLocked = 'horizontal'
    // 後續忽略 deltaY 變化
}
```

### CPU/GPU 最佳化

```javascript
// ✅ GPU 加速
├─ 使用 CSS transform（不用 top/left）
├─ 啟用 will-change: transform
├─ 分層複合（composite layers）
└─ hardware acceleration

// ❌ 避免的操作
├─ 頻繁 getBoundingClientRect()（強制 reflow）
├─ addEventListener 過多（改用代理）
├─ requestAnimationFrame 無限迴圈
├─ 同步 DOM 查詢 + 修改（batch updates）
└─ 超大 touchmove 事件監聽

// 實踐
addEventListener('touchmove', handler, { passive: true })
// passive: true 允許瀏覽器優化（不調用 preventDefault）
```

---

## 交互設計

### 使用者心智模型

**水平模式（樂譜翻頁）：**
```
┌─────────────────────────┐
│ 用戶期望        實現方式 │
├─────────────────────────┤
│ 向右滑動翻頁  → Swipe/Zone Tap
│ 向左滑動翻頁  → Swipe/Zone Tap
│ 捏合放大      → Pinch Zoom
│ 雙指平移      → Pan（跟隨中心點）
│ 單指點擊      → Zone Detection
└─────────────────────────┘
```

**垂直模式（文檔閱讀）：**
```
┌─────────────────────────┐
│ 用戶期望        實現方式 │
├─────────────────────────┤
│ 向下捲動      → Native Scroll
│ 向上捲動      → Native Scroll
│ 上區域點擊    → Page Up (-1 頁)
│ 下區域點擊    → Page Down (+1 頁)
│ 捏合放大      → Pinch Zoom
└─────────────────────────┘
```

### 視覺反饋清單

| 手勢 | 反饋 | 時序 | 用途 |
|------|------|------|------|
| Pinch 進行中 | 即時縮放預覽 (CSS scale) | 連續 | 預視最終大小 |
| Pinch 完成 | 平滑動畫到最終 scale | 0.3s | 流暢過渡 |
| Zone Tap 成功 | 綠色脈衝 + 箭頭 | 0.3s | 確認導航 |
| Zone Tap 邊界限制 | 紅色脈衝 + X 標記 | 0.3s | 邊界反饋 |
| Swipe 進行中 | 頁面跟隨手指 | 連續 | 預視翻頁 |
| Swipe 完成 | 頁面滑出/滑入動畫 | 0.4-0.6s | 過渡效果 |
| Bottom Sheet 下滑 | 面板跟隨 + 背景模糊褪色 | 連續 | 拖曳反饋 |
| Bottom Sheet 釋放 | 淡出動畫或 Snap Back | 0.3s | 確認關閉 |

### 視覺指標設計

**Zone Tap Indicator (TAP-ZONE-INDICATOR)：**
```css
.tap-zone-indicator {
    position: fixed;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    z-index: 9999;
    animation: tapPulse 0.3s ease-out forwards;
}

.tap-zone-indicator.success {
    background: rgba(34, 197, 94, 0.7);  /* 綠色 */
    color: white;
}

.tap-zone-indicator.limit {
    background: rgba(239, 68, 68, 0.7);  /* 紅色 */
    color: white;
}

@keyframes tapPulse {
    0% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1.5); opacity: 0; }
}
```

---

## 已知限制 & 未來改進

### ❌ 目前未實現

- 🚫 旋轉手勢（三指旋轉 PDF）
- 🚫 長按選單（Long Press → Annotation Tool Palette）
- 🚫 雙點擊快速縮放（Double Tap Zoom）
- 🚫 手勢自訂面板（Settings UI for gesture parameters）
- 🚫 軌跡預測（Swipe velocity prediction）

### ⚠️ 已知問題

| 問題 | 平台 | 嚴重性 | 備註 |
|------|------|--------|------|
| Trackpad 快速滑誤觸 Pinch | macOS | 中 | 距離判定閾值可調 |
| Safari 縮放後頁面跳動 | iPad | 中 | zoom reset 清空導致 |
| Multi-finger 支援不完整 | Android Chrome | 低 | 3+ 手指未測試 |
| Bottom Sheet 邊界吸附 | iOS Safari | 低 | 橡皮筋滑動干擾 |

### 🚀 改進建議

**優先順序 1（高影響）：**
1. **雙點擊快速縮放**
   - 偵測連續兩次 tap 在 300ms 內
   - 快速放大到 150%，再次雙點擊復原

2. **長按選單**
   - 長按 > 500ms 顯示標註工具選單
   - 快速選擇工具，無需開啟 Bottom Sheet

**優先順序 2（改善體驗）：**
3. **手勢自訂面板**
   - Settings 中新增 "Gesture Sensitivity"
   - 可調整 Swipe 敏感度、Zone 大小、Pinch 阻尼

4. **軌跡預測**
   - 預估手指移動方向，提前載入下一頁
   - 改善連續翻頁流暢度

**優先順序 3（數據驅動）：**
5. **手勢遙測**
   - 紀錄使用者常用手勢組合
   - A/B 測試不同參數，優化預設

---

## 實現檢查清單

- [x] Pinch Zoom（雙指捏合）
- [x] Swipe Navigation（單指滑動翻頁）
- [x] Zone Tap（區域點擊導航）
- [x] Wheel Zoom（鼠標滾輪縮放）
- [x] Bottom Sheet Drag（浮動面板上下拖曳）
- [x] 手勢衝突迴避（鎖定機制 + 時間抑制）
- [x] 平台適應（macOS/iOS/Android/Chrome 差異）
- [x] 視覺反饋（Zone Indicator 動畫）
- [ ] Double Tap Zoom
- [ ] Long Press Menu
- [ ] Gesture Customization UI
- [ ] Swipe Velocity Prediction
- [ ] Multi-touch Rotation

---

## 技術參考

### MDN / W3C 標準
- Touch Events Level 2 Spec
- Pointer Events Spec (future upgrade path)
- CSS Transforms Module Level 1

### 平台指南
- Apple Human Interface Guidelines (HIG) - Gestures
- Material Design 3 - Interaction / Gestures
- iOS Design Guidelines - Multi-Touch Gestures

### 相關代碼文件
- `src/modules/GestureManager.js` (410 行)
- `src/modules/InputManager.js` (連動)
- `src/modules/ViewerManager.js` (zoom 應用)
- `src/modules/JumpManager.js` (導航)

