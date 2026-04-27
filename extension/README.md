# 真假 Meow 一下 - Extension

## known issues

- [ ] 中國用語的 info tooltip 會因為在 container 內被擋住

## TODO

- [x] 使用者進入任一網站後，可點擊 popup 或按右鍵呼叫插件，使用者授權後**才會讀取網站中新聞內容**並傳給 server 分析
- [x] 將 server 回傳內容呈現於 popup 中，使用 觀點 -> 論據 -> 來源 排列的「樹狀結構」 （一開始來源會是空的），使用者可任意新增或修改樹狀結構，同時將觀點、論據、中國用語分別使用不同顏色標註於新聞文章中
- [x] 使用者修改完後送給語言模型重新分析，完成後將含有 tag 的結果呈現於 popup 中
- [x] 滑鼠移到有被標示的文字上會自動顯示他相關的訊息和 tag （觀點就是會有他相關的論據 論據相關的來源 和 他們的 tag）
- [x] 在 popup/sidebar/report/tooltip 中顯示建議的 Google 搜尋關鍵字
- [x] 在 popup/sidebar 列表中點選各個觀點 / 論據 可以跳轉到網頁上對應的句子
- [x] 在 popup/sidebar 中顯示各個觀點 verification 的結果
- [x] 在 sidebar 中的觀點可以依照 tag 切換
- [ ] 進階分析時更新 Context Menus　讓文字變成進階分析，按下後也會發送進階分析的請求
- [ ] Research ActiveTab Permission, check if there is any other way to get the permission without click extension icon nor context Menus
- [ ] 可以右鍵檢查連結、圖片、影片是否正常
<!-- - [ ] Production 時 firebase 的 api key 要改 -->
- [ ] use [this](https://firebase.google.com/docs/auth/web/chrome-extension) to implement popup login and recaptchat
- [ ] integrate markdown to chat
