Issues:


* [X] Stamp 清除工具
* [ ] 同步問題, local, private, 還有 multiple device 同步編輯問題
* [ ] 刪除工具範圍太大, 建議弄個虛擬框來確定範圍
* [X] [Fixed] iPad 無法Page 無法往上捲, 手勢沒作用, 會變成 Browser 的scrolling
* [X] [Fixed]iPad tool bar 無法移動
* [X] [Fixed] iPad 上, 左上功能 Bar 太粗, 蓋到樂譜,
* [ ] Doc ControlCenter  希望可以縮起/展開,  縮小時單一 icon 化
* [ ] Doc ControlCenter 重啟應該要記住使用者上次移動後的位置
* [ ] iPad 動, 單指跟雙指有不同嗎? 有時發現 雙指捲動, 不會觸動 定位點功能
* [X] Stamp 刪除工具要設計
* [ ] Stamp tool, iOS 設備上就不要有 number keypad 了, 直接 touch 點選 類別 -> stamp 功能, 另外 Stamp Panel 太大, 被左邊尺規給遮住無法移動, 然後橫式的根本無法使用(這要再想想怎麼處理)..
* [ ] Stamp tool 的 Number Pad, 用實體鍵盤 無法 back
* [ ] Touch 設備上, 左右滑動, 應該要跟上下滑動功能一樣, 上同左, 下同右, 單指點螢幕, 跳下一個定位點, 雙指點螢幕, 跳上一個定位點
* [X] [Fixed] 左上放大倍率的文字太大了, 請縮小
* [X] iPad 上/下一頁的手勢要定義, 且寫在 keyboard shortcut help 裡面
* [ ] iPad Help Panel 要怎麼叫出來？
* [X] 小節數工具, Anchor 幫我歸類在 Notion Settings 的 Other(Layout) 群組裡
* [X] [Fixed] Anchor toolset type 改為 'other', 新增的 Anchor/Measure stamps 自動歸類到 Other(Layout) 圖層
* [X] Page 翻頁跳躍問題

  希望設計 Next Target 定位點:

  設計理念:
  之前有個功能就是連續 Anchor 標記, 1/3 page 內的 Anchor 不運作, 只跳到第一 Anchor 設計, 這部分不是很合理, 因為顯示畫面不見是 Full page, 請取消這個設計

  構想建議設計是  一個 Page 內 只有幾的定位點  1. 既有上端目前的定位點, 2. 下個定位點

  下個定位點選定(Next Target)原哲是: 1. 使用者有輸入 Anchor, 這個 Anchor 以最接近畫面中心高度的為優先點, 如果沒有, 下個定位點應該是 畫面尚未顯示的點。

  如果使用者手動設定了多餘的定位點, 我們先以 半透明灰色 anchor 替代.

  Page End 不在系統預設的下個定位點
* [ ]

* 小節輸入為什麼不能用 Physical keypad (PC上面時候)
* 選擇工具在物件有重疊時候, 會選不到底下物件, 也許可以仿照 Delete 功能 , 跳出選單讓使用者選物件
* 

[ ]

### Enhancement:

1. [ ] Tool bar object 鍵盤快捷操作設計

    1. [ ] 點選 Stamp 後, Stamp target 位置, 希望在指標的左上角 位置, 避免 iPad 被手指遮住
    2. [ ] 選定 object 時不要先 確定物件位置, 讓他是浮動狀態, 使用者再按一次才定位, iPad touch 則是離開才定位
    3. [ ] 設計階層式鍵盤快捷操作, 顯示工具列 , 類似 Microsoft Office 的 Ribbon 介面, 點選後才出現對應的工具列，這樣可以適應 iPad, iPhone 等小螢幕裝置
    4. [ ] 工具列定義 number key/或字母 來選定工具到物件, iOS 小設備用數字鍵盤, OSX, Windows 等兩者皆支援
2. [ ] Toggle on/off Ribbon/手機遠端遙控 操作功能, 鍵盤快捷鍵為請幫我定義
    4. 使用方向鍵/滑鼠/touch 操作 object 置放位置
    6. 每個 Tool bar object 群組都有一個數字貨
    7. 每個 Tool bar 物件都有一個數字編號
    7. iPad/iPhone 專屬
3. [ ] 手機遠端操作功能

    1. [ ] Page up/down
    2. [ ] 物件操作
        1. [ ] 同樣採用 iPad 數字鍵盤設計
        2. [ ] 外加 Tocuh 調整位置
4. [ ] 練習專用小節數

    設計連結 YouTube Video

    定位這個小節, 跟 youTube 影片的播放位置

    設定 A-B loop
5. [X] 那個小節數工具..我覺得不用叫出輸入法, 你直接給個數字鍵盤輸入會不會更好. 類似計算機

    - [Fixed] 實作計算機樣式的數字鍵盤 (7-8-9 / 4-5-6 / 1-2-3 / ⌫-0-✓)
6. [X] [Fixed] 還沒登入系統前, toolbars. 不應該出現
7. [ ] Exit Proformance mission 應該要設計成一個 icon, 類似 Logout
8. [ ] 登出系統的那個頁面, Save to Private 等後面的 prompt 要專業的 UI, 不是 瀏覽器的 UI
9. [ ] 登出後, 沒有回到主畫面登入的畫面
1. [ ] 登入後, 選擇 Folder 出現的 score list 應該要是新的頁面, 而不是放在 原來Start a new Mission 頁面的下面或右邊
1. [ ] Create New Identity, 應該要放在 既有 Identity 選擇畫面的右邊..而不是下面
1. [ ] 主畫面的 Select Score Folder 不會出來畫面...
1. [ ] Setting 畫面的 Change project folder 跟 search 太接近了 , Search 應該是跟底下 score list 一起才對
1. [ ] Setting 畫面的 Change Project Folder 不夠專業跟美觀, 另外這邊如果選擇了, 這個專案就變成新的目錄, 蓋掉原來 Main UI startup 選擇的
1. [ ] Private backup 應該只顯示最新的一份, 而不是一直疊加, 舊的可以 backup 在folder裡, 最多三個, 超過刪除
1. [ ] Add new Style 畫面也要精緻化, 不用用 內建
1. [ ] new style 應該要能選擇由 cloud 端抓取, 而不是 local 一直新增
1. [X] 增加小節數工具, 預設在頁面最左邊空白處的 Text Box, 然後使用者 intial 一個數字後, 連續輸入單行小節數, 自動加總, 產生新的 Text Box 往下平移.
1. [X] Stamp Palette 改為由按鈕 toggle 顯示/隱藏 (不再自動展開)
2. [ ] 增加打包給老師 review 的功能
2. [ ] 樂團功能
