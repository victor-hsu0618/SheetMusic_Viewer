Issues:

* [X] iPad 無法Page 無法往上捲, 手勢沒作用, 會變成 Browser 的scrolling
* [ ] iPad tool bar 無法移動

* [X] iPad 上, 左上功能 Bar 太粗, 蓋到樂譜, 希望可以縮小甚至 縮小到單一 icon 化
  - [Fixed] 使用 @media (pointer: coarse) 自動縮小到 0.82 倍, 只針對觸控裝置
* [X] [Fixed] 左上放大倍率的文字太大了, 請縮小

* [X] iPad 上/下一頁的手勢要定義, 且寫在 keyboard shortcut help 裡面
* [ ] iPad Help Panel 要怎麼叫出來？

* [X] 小節數工具, Anchor 幫我歸類在 Notion Settings 的 Other(Layout) 群組裡
  - [Fixed] Anchor toolset type 改為 'other', 新增的 Anchor/Measure stamps 自動歸類到 Other(Layout) 圖層

Enhancement:

1. [ ]
2. [X] 那個小節數工具..我覺得不用叫出輸入法, 你直接給個數字鍵盤輸入會不會更好. 類似計算機
   - [Fixed] 實作計算機樣式的數字鍵盤 (7-8-9 / 4-5-6 / 1-2-3 / ⌫-0-✓)
3. [ ] 在沒有 Anchor 或 page 切換的點, 可以自動產生一個虛擬 anchor icon, 在頁面往上跳的時候, 使用者很清楚, 跳到哪邊, 加強辨識能力
4. [X] [Fixed] 還沒登入系統前, toolbars. 不應該出現
5. [ ] Exit Proformance mission 應該要設計成一個 icon, 類似 Logout
6. [ ] 登出系統的那個頁面, Save to Private 等後面的 prompt 要專業的 UI, 不是 瀏覽器的 UI
7. [ ] 登出後, 沒有回到主畫面登入的畫面
8. [ ] 登入後, 選擇 Folder 出現的 score list 應該要是新的頁面, 而不是放在 原來Start a new Mission 頁面的下面或右邊
9. [ ] Create New Identity, 應該要放在 既有 Identity 選擇畫面的右邊..而不是下面
10. [ ] 主畫面的 Select Score Folder 不會出來畫面...
11. [ ] Setting 畫面的 Change project folder 跟 search 太接近了 , Search 應該是跟底下 score list 一起才對
12. [ ] Setting 畫面的 Change Project Folder 不夠專業跟美觀, 另外這邊如果選擇了, 這個專案就變成新的目錄, 蓋掉原來 Main UI startup 選擇的
13. [ ] Private backup 應該只顯示最新的一份, 而不是一直疊加, 舊的可以 backup 在folder裡, 最多三個, 超過刪除
14. [ ] Add new Style 畫面也要精緻化, 不用用 內建
15. [ ] new style 應該要能選擇由 cloud 端抓取, 而不是 local 一直新增
16. [X] 增加小節數工具, 預設在頁面最左邊空白處的 Text Box, 然後使用者 intial 一個數字後, 連續輸入單行小節數, 自動加總, 產生新的 Text Box 往下平移.
17. [X] Stamp Palette 改為由按鈕 toggle 顯示/隱藏 (不再自動展開)
18. [ ] 增加打包給老師 review 的功能
19. [ ] 樂團功能
