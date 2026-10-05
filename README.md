# 一起出發｜員工旅遊調查

線上網站：https://et20020223.github.io/trip-poll/

HTML / CSS / JavaScript 前端部署在 GitHub Pages，Google Sheets 儲存資料，Apps Script 處理 Google 登入、員工 Email 名單與權限驗證。OAuth 密鑰只保存在 Apps Script 指令碼屬性；此儲存庫不包含員工名單或調查資料。

## 五階段流程

1. 地點提案：每人最多三個，員工可移除自己的提案，管理員可移除任何提案。
2. 第一輪初選：管理員設定票數並編輯預算、交通、住宿等卡片資訊。
3. 最終決選：投票選擇入圍地點。
4. 結果與日期：匿名票數統計，由管理員公布地點與日期。
5. 景點募集：同事新增景點及推薦原因。

前三階段可持續新增不方便參加的週次與備註。調查期間為 2026 年 12 月至 2027 年 2 月，每週星期四至次週星期二。

## 開發與部署

```sh
npm test
npm run preview
```

正式站透過 `.github/workflows/pages.yml` 自動部署 `web/`。本機預覽需將私人 SurveySettings 的 FRONTEND_URL 及 Google OAuth 用戶端來源同步設定為本機網址。

部署其他環境時，將 `web/config.js` 換成自己的 Apps Script 部署網址；設定指令碼屬性 SPREADSHEET_ID、GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET 與 GOOGLE_WORKSPACE_DOMAIN。將 SurveySettings 的 FRONTEND_URL 設為完整網站網址，並在 Google Cloud OAuth 用戶端加入相同 origin。後端部署存取範圍維持公司內部帳號。

Apps Script 程式在 `apps-script/`；初始化範例管理員為 `admin@example.com`，實際使用前請換成自己的管理員。若將 config 的 appsScriptUrl 留空，則使用記憶體中的示範資料。
