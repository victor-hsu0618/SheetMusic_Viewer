# ScoreFlow Automation & Manual Testing Guide

To save regular AI interaction costs and ensure the application is working correctly on your machine, you can run the automated E2E test suite or follow the manual testing procedures defined below.

## 🤖 Automated E2E Testing (Preferred)

### Prerequisites

1.  **Install Node.js dependencies**:
    ```bash
    npm install
    ```
2.  **Install Playwright Browsers** (First time only):
    ```bash
    npx playwright install chromium
    ```

### How to Run

1.  **Ensure your dev server is running**:
    ```bash
    npm run dev
    ```
2.  **Run the test script**:
    ```bash
    npm run test:e2e
    ```

---

## 🖐️ Manual Testing Procedures (測試手法)

If you prefer to test specific features manually, follow these steps to ensure everything is functioning correctly:

### 1. Sidebar & Tabs (側邊欄與分頁)
- **Action**: Hover your mouse near the **left edge** of the screen.
- **Expected**: The sidebar should glide open smoothly.
- **Action**: Click through the 4 tabs: **Library, Score, Orchestra, Settings**.
- **Expected**: Content should switch instantly. The active tab button should be highlighted.

### 2. Notation Visibility (標記顯示切換)
- **Action**: Switch to the **Score** tab.
- **Expected**: You should see a list of categories (Draw Objects, Fingering, etc.).
- **Action**: Observe the buttons.
    - If a category is **Active** (Purple/Blue): The button should say **"Hide"**.
    - If a category is **Inactive** (Grey): The button should say **"Show"**.
- **Action**: Click a "Hide" button.
    - **Expected**: The button should turn Grey, the label changes to "Show", and any markings of that type on the sheet music should disappear.
- **Verify**: Check the browser console (`F12` or `Cmd+Option+I`). You should see a log: `[ScoreFlow] Layer "..." visibility set to: false`.

### 3. Adding New Categories (新增註記類別)
- **Action**: In the **Score** tab, click **"+ Add Notation Category"**.
- **Expected**: A prompt appears. Enter a name (e.g., "Cello Solo").
- **Result**: A new layer item should appear in the list with a random color dot.

### 4. Orchestra Collaboration (Cloud Sync 樂團協作)
- **Settings/Goal**: Test the shared annotation folder functionality using the path: `/Users/victor_hsu/MyProgram/SheetMusic_Viewer/Test_Document/大稻埕2026-下半年/Annotations`
- **Action**: Switch to the **Orchestra** tab.
- **Action**: Click **"Connect Cloud Study Folder..."**.
- **Action**: Select the specific `/Annotations` folder mentioned above.
- **Expected**: A success message should appear, and the status bar should show "☁️ Syncing: Annotations".
- **Action**: Click **"Publish Translation"**.
- **Result**: A new `.json` file should be created inside that directory. 
- **Verify**: Open the folder in Finder to check if the file exists.

### 5. Jump Offset Settings (跳轉設定)
- **Action**: Switch to the **Settings** tab.
- **Action**: Move the "Jump Offset" slider.
- **Expected**: The value next to the slider (e.g., `1.0s` or `5.5s`) should update in real-time.

### 6. Document Bar (浮動工具列)
- **Action**: Open any PDF score from the Library.
- **Action**: Drag the floating bar at the bottom.
- **Expected**: It should move freely without lag.
