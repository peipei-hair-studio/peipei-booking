# Pei Pei 美髮預約系統

React / TypeScript / Vite / Tailwind CSS / React Router，Netlify Functions、Netlify Database PostgreSQL、`@netlify/database` 的 `getDatabase()`、Zod、Argon2id、Vitest。介面為繁體中文，時區固定 `Asia/Taipei`，新台幣整數計價。

店址：高雄市楠梓區後昌路1029號；電話：07-3655699。初始營業時間 11:00–20:00，週三休。服務分類已建立，**沒有虛構服務價格或預設帳密**；首次登入後建立服務、填入價格與分鐘數，啟用後才開放顧客預約。

## 1. 環境準備

- Node.js 22.14 以上（建議 Node 22 LTS）、npm、Git。
- GitHub 與 Netlify 帳戶，建立站點與啟用 Database 前確認帳戶方案及費用。專案本身不建立付費資源，也不執行正式部署。
- 開發用資料庫由 Netlify CLI 啟動，不需 Docker 或獨立資料庫帳戶。
- 在此 `peipei-booking` 目錄執行以下指令。不可將資料庫 URL、密碼或 token 貼入聊天、Git 或部署日誌。

## 2. 安裝套件

```powershell
npm install
Copy-Item .env.example .env
```

正式重現依賴可使用 `npm ci`，版本由 `package-lock.json` 鎖定。若本機 npm 鏡像逾時，使用 `npm install --registry=https://registry.npmjs.org`。

以密碼管理器產生至少 32 字元的隨機秘密，填入本機 `.env` 的 `RATE_LIMIT_SECRET`。`APP_ORIGIN=http://localhost:8888`。此秘密只供 Functions 使用，不使用 `VITE_` 前綴。資料庫連線由 Netlify 管理，不填入前端。

也可執行 `npm run setup:local` 自動建立／補齊本機 `.env` 與隨機安全密鑰（不會印出秘密、不會設定管理員密碼）。環境變數變更後重新啟動開發伺服器。

## 3. Netlify CLI 安裝與版本查核

本專案已安裝本機 CLI，避免全域版本不同：

```powershell
npx netlify --version
npx netlify database --help
npx netlify database init --help
```

官方目前要求 CLI 26 以上。若需要全域 CLI：`npm install -g netlify-cli`。升版後先查核 help，提交 lockfile，重新執行驗證。

## 4. Netlify Database 初始化

```powershell
npx netlify database init
```

此官方指令安裝/確認 `@netlify/database`、設定本機資料庫及 migration。專案已包含完整 `0001_initial.sql`，保留它；不要新增同一 schema 的重複 starter migration。若 CLI 要求雲端帳戶或站點，先依第 9 節建立並連結自己的站點，確認方案後再繼續，不要任意接受付費升級。

**不使用 `@netlify/neon`、drizzle-kit push 或自行建立 Neon。** 雲端分支及連線字串由 Netlify 管理。

## 5. 本機執行

```powershell
npm run dev
```

開啟 `http://localhost:8888`，不要只開 Vite 5173 埠：Functions、同源 Cookie 與 Database 都需要 `netlify dev`。本機 HTTP 僅在 localhost/127.0.0.1 省略 Secure Cookie；正式 HTTPS Cookie 固定 HttpOnly、Secure、SameSite=Strict，8 小時過期。

資料庫未連線時顯示錯誤與重試，不會顯示假的預約成功。重新整理成功頁不持久化個資或預約編號，請顧客保存送出成功時的編號。

## 6. Migration 使用方式

另一個終端（保持 `netlify dev` 運行）：

```powershell
npx netlify database migrations apply
npx netlify database status
```

開發新 schema：

```powershell
npx netlify database migrations new --description "add_new_field" --scheme sequential
# 編輯新產生的 migration.sql
npx netlify database migrations apply
```

正式站與 deploy preview 由 Netlify 在發布生命週期自動執行 `netlify/database/migrations/`；migration 失敗應阻止發布。已套用的檔案不要改寫，以新增向後相容 migration 處理。`reset` 會刪資料，本專案不自動執行。不要以 build command 直接對正式資料庫做推送或還原。

## 7. 首次管理員建立

本機完成 migration 並保持 `netlify dev` 運行：

```powershell
npm run admin:init
```

輸入帳號與至少 12 字元密碼，密碼不回顯、不透過參數或環境變數傳遞。工具以 Argon2id（64 MiB、3 次、parallelism 1）雜湊，交易鎖確保只有第一個管理員能建立；再次執行會拒絕。沒有公開註冊/初始化 API。

正式環境首次建立：從 Netlify Database 的連線介面取得**正式分支**連線資料，以受信任終端/密碼管理器將 `NETLIFY_DB_URL` 暫時注入目前程序環境（勿輸入含秘密的 shell 指令、勿開啟終端錄製），再執行 `npm run admin:init`；工具偵測到此變數時不呼叫本機 CLI。完成後清除此環境變數並關閉終端。不要在 build command、Functions 或 CI 加入管理員初始化。正式與 preview 分支資料分開，確認目標再執行。

`/admin/login` 登入後，在 `/admin/services` 新增正式服務並啟用。在 `/admin/settings` 調整時段、容量、天數、每週營業時間與指定店休日。

密碼忘記時由有資料庫管理權限的人員在維護窗口，以受信任離線腳本重新計算 Argon2id hash、更新指定帳號並撤銷其全部 sessions；本工具刻意不提供通用密碼重設後門。不要把明文密碼寫入 SQL。

## 8. 上傳 GitHub

先確認 `.env`、`.netlify`、備份檔均被 `.gitignore` 排除。不要上傳任何顧客資料。

```powershell
git init
git add .
git diff --cached --stat
git commit -m "建立 Pei Pei 預約系統"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/peipei-booking.git
git push -u origin main
```

建議 GitHub 設為 private，`main` 啟用 branch protection，以 PR 和 deploy preview 驗收。若 Git 儲存庫根目錄在上一層，請改用相應路徑且 Netlify base directory 設 `peipei-booking`。

## 9. Netlify 連接 Repository

在 Netlify 選擇新增專案 → Import an existing project → GitHub → 授權指定 repository → 選擇 `peipei-booking`。先停用自動正式發布或使用獨立驗收站，確認方案/Database 額度，不要未確認就升級。

本機連結既有站點：

```powershell
npx netlify login
npx netlify link
```

啟用站點內建 Netlify Database。首次正式發布前核對 migrations 與預覽驗收；按下正式部署即由帳戶持有人授權發布。不要把站點另接獨立 Neon 或其他資料庫。

## 10. 部署設定

- Base directory：repository 根就是此專案時留空；若專案在 repo 子資料夾則填 `peipei-booking`。
- Build command：`npm run build`；Publish directory：`dist`。
- Functions：`netlify/functions`；Node 22；設定已在 `netlify.toml`。
- Functions 環境變數：`APP_ORIGIN=https://你的正式網域`（無結尾斜線）及至少 32 字元 `RATE_LIMIT_SECRET`。
- Netlify 自動供應 `NETLIFY_DB_URL`；不要複製至 `VITE_*` 或前端。
- preview 使用自己的 HTTPS origin，分 context 設定 `APP_ORIGIN`。未設定正式 origin 時，伺服器拒絕修改請求。
- `/api/*` 先路由至 Function，SPA 僅 fallback `/admin/*` 與 `/booking/success`，不以全域 `/*` 覆蓋 API / Functions。
- `argon2` 保留原生依賴，由 Netlify Linux build 安裝，不要將 Windows node_modules 上傳。

正式 CSP 僅由 Vite build 注入 `dist/index.html` 的 meta 標籤，不產出 `_headers`，避免 Netlify dev 讀到上一次 build 的正式標頭而阻擋開發樣式。禁止嵌入的 `X-Frame-Options: DENY` 保留在 `netlify.toml`。正式站不允許 inline scripts/styles。

## 11. 測試與正式環境驗收

```powershell
npm run typecheck
npm test
npm run build
```

測試分成規則單元測試、官方 `@netlify/database-dev` migration 相容測試、真實 PostgreSQL 整合測試。整合測試使用 `embedded-postgres` 提供的本機 binary 啟動暫存隔離實例，只替換連線取得器，實際執行交易、SQL、trigger 與 API；正式站仍僅使用 Netlify Database。測試價格只存在於隔離測試實例。涵蓋總價/時長、公休、打烊、過去日期、多服務重疊、並行提交、兩連線直接 SQL 撞期、容量調整、idempotency、取消釋放、改期、歷史快照、非法輸入、權限、CSRF、session、登入限流及個資隱私。這不等同雲端 PostgreSQL 與正式 Netlify 路由已驗收。

測試需允許啟動子程序與 localhost 連線；Linux 請以一般使用者執行，不使用 root。Windows 測試 binary 自動複製到系統暫存目錄，避開中文工作目錄的原生工具編碼問題，結束會關閉並清除隔離實例。官方本機模擬器只有單一執行環境，因此 `netlify dev` 將應用 pool 限制為單連線；並行正確性以真實 PostgreSQL 測試。請勿讓測試指向正式資料庫。

正式前請在隔離 preview 實測：

1. migrations 成功、API 失敗不顯示預約成功、未登入管理 API 回 401。
2. 初始化該環境管理員、檢查 HTTPS Cookie 的 Secure/HttpOnly/SameSite，登出後不可操作。
3. 建立正式服務/價格、顧客可複選、可預約日期與週三/店休日/打烊檢查。
4. 用兩個瀏覽器同時送出相同時段，只有容量內預約成功；重複提交回同編號。
5. 管理員確認/改期/取消/完成、手動新增、日期/姓名/電話/狀態搜尋與分頁。
6. 修改服務價格，既有快照保持不變；停用後前台重載即消失；audit_logs 有操作紀錄。
7. 手機寬度、鍵盤焦點、欄位標籤、載入/空資料/錯誤重試及六條路由直接重新整理。
8. 正式站重做必要檢查，測試資料以後台取消；不要在正式站跑會清空表的整合測試。

目前驗證結果見 `VERIFICATION.md`；實際雲端部署、費用與正式資料庫權限必須以使用者帳戶驗收。

## 12. 備份與還原

使用 Netlify Database 的 Backup and recovery 功能；可用的保留期間與時間點還原依帳戶方案為準，先在控制台核對，不假設免費方案提供特定期限。正式 migration/大量異動前建立可識別還原點。

額外離線備份：安裝相容 PostgreSQL 用戶端，在可信終端以密碼管理器注入 `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` 與 `PGSSLMODE=require`，再執行（無連線密碼出現在參數）：

```powershell
pg_dump --format=custom --no-owner --no-acl --file=peipei-backup.dump
```

備份加密存於限制權限的位置，不入 Git；包含個資、hash、sessions，依店家保存政策管理。備份後清除程序環境中的秘密。定期在**空白隔離還原目標**測試：

```powershell
pg_restore --no-owner --no-acl --dbname=隔離還原資料庫 peipei-backup.dump
```

還原時環境連線仍由秘密管理工具提供。先驗證表數、筆數、快照、約束與 migrations 記錄一致，撤銷還原資料庫所有 admin_sessions，避免舊 token 復活。正式災難還原需另行授權及停寫維護窗口；先備份當前狀態，再以 Netlify 官方還原流程操作，不直接覆蓋正式表。Git 回退不能替代資料庫還原。

## 13. 免費額度用量監控

在 Netlify Usage & billing / Database 面板檢查 Functions 請求與運算、Database 儲存/運算、網路流量、build 次數/分鐘。免費額度可能調整，查看帳戶當下方案與官方頁面；本文件不承諾固定免費金額。設定支出通知、可用時的預算限制、自動擴容上限及閒置休眠，避免無限制升級。

定期檢查取消與完成預約資料保存政策、audit_logs 與登入限流表大小。過期 sessions 與超過一天的限流記錄在成功登入時清理；沒有登入活動時不會自動清理。大流量前可另加 Netlify 平台限流，既有 Functions 針對登入 IP/帳號、公開預約 IP 採資料庫原子限流。容量 trigger 用全店互斥鎖與有效區間掃描，適用單店規模；資料量增長時需依真實負載調整索引/歷史封存，不宣稱可承受未測量高流量。

## 安全與一致性說明

- SQL 全部使用參數，不拼接使用者資料；固定 SQL 片段僅用於已知查詢結構。
- 多步操作使用 `getDatabase().pool.connect()` 同一連線交易；booking_items 快照與 audit 同交易提交。
- 容量採等效強一致性約束：資料庫 trigger 先更新 singleton settings 列取得排他列鎖，再以半開區間最大同時占用數判斷；取消不占用。READ COMMITTED 下後續 volatile SQL 使用新 snapshot；更高隔離等級遇到競爭會中止交易。即使繞過 API 直接 SQL，也無法寫入超容量預約。降低容量亦受 trigger 保護；所有應用寫入鎖順序一致。
- 服務時間最多 540 分鐘、多項加總最多 540；零元可以由店家明確設定，空白價格不可啟用。預約未來天數包含今天至今天+N 天，開始必須晚於現在。
- `completed` 保留歷史占用，僅服務結束後能完成。已取消/已完成預約不可重開；改期沿用服務快照，不依現價重算。
- 調整營業時間/公休不自動移動既有預約；管理員需自行協調，容量不可降到低於未來既有占用。
- 工作階段 token 32 隨機 bytes、資料庫只存 SHA-256；CSRF 使用每 session 隨機 token 加嚴格 Origin；禁止跨站修改。API 不回傳內部例外、SQL 或個資日誌。
- audit 保存修改者、時間、服務/設定前後值與預約時間/狀態，刻意不複製顧客姓名電話備註。無公開顧客查詢 API。

## 品牌、社群與優惠管理（2026-11-14 新增）

頁尾採品牌介紹／門市聯絡雙欄設計，手機版上下排列。管理入口移至頁尾版權旁的小鎖，可用鍵盤操作；頁首不再顯示店務管理連結。後台「前台文案 → 頁尾介紹與聯絡資訊」可編輯頁尾介紹、聯絡標題、營業時間、版權與預約制說明。社群連結沿用品牌設定，未設定網址時不顯示。

登入後開啟 `/admin/settings` 的「品牌、優惠與預約設定」：

- **品牌與社群**：設定店名、文字 LOGO 或 LOGO 圖片、地址電話、IG 作品集與官方 LINE。圖片可輸入 HTTPS 圖片網址，或上傳不超過 150 KB 的 PNG/JPEG/WebP，圖檔內容儲存在 Netlify Database 的品牌設定中。空白社群網址不顯示按鈕；IG 限 instagram.com，LINE 限 line.me / lin.ee / page.line.me 等官方網域，拒絕 javascript 或假冒網址。
- **前台文案**：編輯首頁標題、副標題、簡介、社群按鈕名稱、頁尾、四步驟標題、聯絡表單、預約小卡、優惠說明、預約完成及登入頁文案。系統驗證錯誤與管理操作介面由程式維護；不接受自訂 HTML/JavaScript。
- **配色與字形**：設定背景色、主色及黑體／明體。請保持文字對比清晰。所有內容按「儲存品牌與內容」後寫入資料庫，前台重載可見；本機不以 localStorage 保存。
- **優惠活動**：可新增、編輯、排序、啟用／停用。選固定新台幣折抵或百分比折抵，設定起訖日期、適用服務與最低金額。未勾選服務表示全部服務。

優惠期間以 **Asia/Taipei 的預約服務日期** 判斷，包含起訖當日；每筆只能選一項、不疊加。百分比是「折抵比例」：10 表示折抵 10%（九折），折抵金額向下取整。門檻只加總適用服務原價，優惠最多折抵適用服務原價，總額不會負數。預約時間不因折扣縮短。首頁顯示未結束且啟用的活動，顧客選好服務與日期後只會看到可使用的優惠。

後端重新查核活動與金額，若送出時與顧客確認總額不同會拒絕並要求重新確認，不以新金額悄悄成立預約。預約保留 `subtotal`、`discount`、`promotion_snapshot`，原服務快照保留折抵前價格；活動後續改名、變更折扣或停用不影響歷史訂單。管理員改期保留原優惠快照與原成交金額（即使新日期不在原活動期間），需要換活動時請取消並重建預約。所有設定修改保存 audit。

新增 migration `0002_brand_promotions.sql`，包含 `site_settings`、`promotions`、`promotion_services`，並擴充預約金額快照。本機已套用；其他開發環境保持 `npm run dev` 運行後執行 `npx netlify database migrations apply`。正式環境依原 Netlify migration 發布流程執行，不需要重建資料庫。

管理員最低密碼長度已改為 **12 字元**，上限 256；既有密碼保持有效，不會自動變更。首次建立仍使用 `npm run admin:init`。

## 官方文件連結

- [Netlify Database API](https://docs.netlify.com/build/data-and-storage/netlify-database/api/)
- [CLI 指令](https://docs.netlify.com/build/data-and-storage/netlify-database/cli/)
- [Migrations](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/)
- [本機開發與測試](https://docs.netlify.com/build/data-and-storage/netlify-database/local-development/)
- [備份與復原](https://docs.netlify.com/build/data-and-storage/netlify-database/backup-and-recovery/)
- [Database 用量](https://docs.netlify.com/build/data-and-storage/netlify-database/billing-and-usage/)
