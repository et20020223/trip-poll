# 一起出發｜員工旅遊調查

線上網站：https://et20020223.github.io/trip-poll/

HTML / CSS / JavaScript 前端部署在 GitHub Pages，Google Sheets 儲存資料，Apps Script 處理 Google 登入、員工 Email 名單與權限驗證。Google 帳號不限公司網域，登入後仍須符合啟用名單；Google sub 首次登入後固定綁定，帳號不符或停用時拒絕存取。OAuth 密鑰只保存在 Apps Script 指令碼屬性；此儲存庫不包含員工名單或調查資料。

## 六階段流程

1. 地點提案：每人最多三個，員工可移除自己的提案，管理員可移除任何提案。
2. 第一輪初選：管理員設定票數並編輯預算、交通、住宿等卡片資訊，可直接在卡片登記額外得票數。
3. 最終決選：投票選擇入圍地點，管理員可直接在卡片登記本輪額外票數。
4. 結果與日期：匿名票數統計，由管理員公布地點與日期。
5. 景點募集：同事新增景點及推薦原因。
6. 景點評分：每人替景點評 0～3 分，可重新修改；顯示總分排行、平均分、評分／未評分人數及分數分布。

前三階段可持續新增不方便參加的週次與備註。調查期間為 2026 年 11 月至 2027 年 2 月，每週星期四至次週星期二。

## 開發與部署

```sh
npm test
npm run preview
```

正式站透過 `.github/workflows/pages.yml` 自動部署 `web/`。本機預覽需將私人 SurveySettings 的 FRONTEND_URL 及 Google OAuth 用戶端來源同步設定為本機網址。

部署其他環境時，將 `web/config.js` 換成自己的 Apps Script 部署網址；設定指令碼屬性 SPREADSHEET_ID、GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET 。將 SurveySettings 的 FRONTEND_URL 設為完整網站網址，並在 Google Cloud OAuth 用戶端加入相同 origin。Google OAuth 目標對象設為外部；Apps Script 以擁有者執行、存取範圍設為「所有人」，使未登入者可載入登入服務。調查資料的每次讀寫仍需由後端驗證 Google 身分、Users 啟用名單與角色。

Apps Script 程式在 `apps-script/`；初始化範例管理員為 `admin@example.com`，實際使用前請換成自己的管理員。若將 config 的 appsScriptUrl 留空，則使用記憶體中的示範資料。

管理員登記票數各輪獨立，與線上選票相加；重新儲存取代先前登記值，輸入 0 可清除本輪登記數。請勿重複登記已在線上投出的票。第一次儲存會新增 ManualVotes 工作表，保存地點、輪次、票數、記錄者與時間；Audit 保存前後票數。一般員工無法修改，結果階段只公布匿名合計。

景點評分在第六階段開放，0＝不想去、1＝沒特別興趣但可以配合、2＝想去、3＝非常想去希望排進行程。未評分不計作 0 分。同分並列，統計只納入啟用名單；每人每景點只有一筆評分，重新儲存會更新。首次儲存自動新增 AttractionRatings（email, attractionId, score, updatedAt），一般參與者只取得自己的個別評分和匿名統計。管理員需先確認目的地、出遊日期及至少一個募集景點，才可切換第六階段。已有評分的景點在回到第五階段時不能刪除。
