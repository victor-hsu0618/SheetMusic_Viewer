# 任務清單：同步重設與點擊標記修復

- [x] 在 `ScoreDetailManager.js` 中實作 Tombstone 墓碑重設邏輯 <!-- id: 4 -->
- [x] 確保重設後立即呼叫 `SupabaseManager` 推送刪除狀態 <!-- id: 5 -->
- [x] 驗證 Machine B 是否能接收到重設訊號並自動清除本機資料 <!-- id: 6 -->
- [ ] 修復螢光筆/畫筆點擊產生的「圓球」同步問題 <!-- id: 8 -->
    - [ ] 在 `AnnotationRenderer.js` 中顯式繪製單點路徑 <!-- id: 9 -->
    - [ ] 確保 `InteractionManager.js` 正確觸發單點同步 <!-- id: 10 -->
- [ ] 更新 `walkthrough.md` <!-- id: 7 -->
