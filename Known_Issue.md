Issues:

* [X] Hotkey feature are gone. Help, jump ?
* [X] PDF File Hash key in Json file for sync.
* [X] All notation category should be sync. example, measure number, anchor. bookmark...etc.
* [X] User Profile should be sync once connected to Google Drive.
* [X] 小節數工具計算裡的 increment 應該要是本次增加的小節數, 然後  增減 更新本次預計的小節數
* [ ] iPad 螢幕左右邊緣觸控響應不穩定 (因 Full Screen 容器堆疊與 PDF 邊距引發的事件攔截衝突)



* [ ] Enhancement:

1. [ ]
2. [X] 那個小節數工具..我覺得不用叫出輸入法, 你直接給個數字鍵盤輸入會不會更好. 類似計算機
    - [Fixed] 實作計算機樣式的數字鍵盤 (7-8-9 / 4-5-6 / 1-2-3 / ⌫-0-✓)
3. [ ] 在沒有 Anchor 或 page 切換的點, 可以自動產生一個虛擬 anchor icon, 在頁面往上跳的時候, 使用者很清楚, 跳到哪邊, 加強辨識能力
4. [X] [Fixed] 還沒登入系統前, toolbars. 不應該出現

1. [X] [Removed] 主畫面的 Select Score Folder 不會出來畫面...
2. [ ] Setting 畫面的 Change project folder 跟 search 太接近了 , Search 應該是跟底下 score list 一起才對
3. [ ] Setting 畫面的 Change Project Folder 不夠專業跟美觀, 另外這邊如果選擇了, 這個專案就變成新的目錄, 蓋掉原來 Main UI startup 選擇的
4. [ ] Private backup 應該只顯示最新的一份, 而不是一直疊加, 舊的可以 backup 在folder裡, 最多三個, 超過刪除
5. [ ] Add new Style 畫面也要精緻化, 不用用 內建
6. [ ] new style 應該要能選擇由 cloud 端抓取, 而不是 local 一直新增
7. [X] 增加小節數工具, 預設在頁面最左邊空白處的 Text Box, 然後使用者 intial 一個數字後, 連續輸入單行小節數, 自動加總, 產生新的 Text Box 往下平移.
8. [X] Stamp Palette 改為由按鈕 toggle 顯示/隱藏 (不再自動展開)
9. [ ] 增加打包給老師 review 的功能, zip PDF and json and forward to user.
1. [ ] Music Anchor / Playback Panel 強化 (多重媒體清單 UI 優化、Anchor 吸附邏輯精細化)
