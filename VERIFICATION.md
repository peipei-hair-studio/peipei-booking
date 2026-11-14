# 驗證紀錄

驗證日期：2026-11-14（Asia/Taipei）。本紀錄區分本機通過與尚未測試的外部環境，不代表已發布正式站。

| 項目 | 結果 |
| --- | --- |
| npm install / package-lock | 完成；直接依賴已固定確切版本 |
| npm run typecheck | 通過 |
| npm run build | 通過；產生 dist/index.html、JS、CSS，正式 CSP 僅注入 build 的 HTML meta |
| npm test | 最新 49 / 49 通過，5 個測試檔，包含品牌、優惠與 build CSP 回歸測試，無跳過測試 |
| 官方 CLI 版本 | netlify-cli 27.18.0，查核 database init --help |
| netlify database init --yes | 成功執行；CLI 偵測已有 migrations，未另產生樣本 schema |
| netlify dev | 啟動成功；Vite 與 api Function 載入成功 |
| netlify database migrations apply | 本機 0001_initial 與 0002_brand_promotions 成功套用 |
| netlify database status | 初始狀態已確認；其後新增 0002 亦已成功套用，未操作雲端資料庫 |
| 官方 database-dev 相容性 | migration 與初始容量讀取通過 |
| 真實 PostgreSQL 整合測試 | PostgreSQL 18.6，本機暫存實例、最多 6 個連線，測後關閉清除 |
| 瀏覽器檢查 | 首頁與管理員登入頁樣式正常、無服務時不能下一步、未登入導向登入頁 |
| npm audit --omit=dev | 0 已知漏洞 |
| npm audit（含開發工具） | 15 項：2 low、13 moderate，0 high/critical；主要經 Netlify CLI 的間接依賴，不採強制降版 CLI |

## 自動化範圍

11 項規則測試：金額與時間加總、未定價、公休、指定店休、打烊、過去與範圍、剛好打烊、多服務重疊、相鄰時段、容量峰值、非法輸入。

1 項官方模擬器 migration 測試。

20 項真實 PostgreSQL 測試：並行預約、多服務撞期、重複提交、取消釋放、價格快照、改期撞期、直接 SQL 約束、雙連線直接寫入、容量調整、未授權、CSRF、非法資料、公開 API 隱私、session 過期、登入/登出/限流、12 筆同時競爭容量、服務新增修改停用、店休設定、手動新增與搜尋、歷史服務禁止刪除。

## 外部與人工驗收限制

本次品牌與優惠擴充另完成 16 項測試：固定金額、百分比取整、指定服務、折抵上限、日期邊界、停用與門檻、適用服務門檻、無活動原價、非法活動、官方社群連結驗證、危險圖片資料拒絕、12 字元密碼規則，以及品牌 API 權限/CSRF、優惠歷史快照/改期/停用、優惠服務限制與金額偽造、送出時舊報價拒絕。瀏覽器已確認原登入工作階段可進入「品牌、優惠與預約設定」，品牌欄位、IG/LINE、LOGO 上傳及活動管理正常載入；沒有替使用者填入虛構社群網址或正式優惠。

- 未連接或建立 GitHub repository、未連結 Netlify 站點、未建立付費資源、未發布正式生產站。
- 雲端 PostgreSQL 的角色權限、正式與 preview 分支自動 migration、Linux 原生 Argon2 安裝、HTTPS 真實 Cookie 與正式路由尚待帳戶環境驗收。
- 首次正式管理員與密碼未設定；未替使用者建立預設帳密。初始化工具需由持有人在可信終端互動執行。
- 沒有在本機持久資料庫植入測試服務價格或帳號；測試資料只在隔離 PostgreSQL 中。
- 瀏覽器完成首頁空資料、樣式與未登入保護檢查；未透過瀏覽器操作整段管理員 CRUD 或顧客已定價服務預約。這些 API 由自動化整合測試涵蓋，仍建議在 preview 以手機、鍵盤與真實帳戶完成 README 的人工驗收。
- 本機實測 Node 24.14.1；部署固定 Node 22，尚待 Netlify Linux build 驗證。
- 本機 emulator 為單執行環境，不能代替多連線交易測試；並行斷言是在真實 PostgreSQL 上通過，不宣稱 WASM emulator 有真實並行隔離。
- 沒有測試雲端備份還原、額度提醒與壓力負載；依 README 以使用者帳戶操作。

## 過程中已修正的問題

- npm 既有鏡像 504：改使用官方 registry 完成安裝。
- 官方 driver 的 pg / serverless PoolClient 型別差異：僅對共同 query/release 介面做相容轉型。
- 官方 emulator 共用交易狀態：本機開發單連線，真實 PostgreSQL 驗證並行。
- Windows 中文 binary 路徑初始化編碼：測試 binary 複製至 ASCII 暫存目錄。
- Netlify 不接受 /.netlify/functions 的自我 redirect：移除，API 規則優先，SPA 使用明確路徑。
- 正式 CSP 阻擋 Vite 開發樣式：確認 Netlify dev 即使設定 dev.publish 仍可能讀取舊 dist/_headers，改為 build-only HTML meta，保留 X-Frame-Options。重新 build、重啟與瀏覽器以新網址讀取後確認奶油白、粉色、字形與版面恢復；舊網址可能需要強制重新整理。
- PostgreSQL 18 RESTRICT 的 SQLSTATE 是 23001：修正測試斷言與 API 錯誤對應，實際刪除限制保持有效。
