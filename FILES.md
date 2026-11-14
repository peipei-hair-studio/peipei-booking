# 專案檔案清單

```text
peipei-booking/
├── package.json
├── package-lock.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
├── netlify.toml
├── .env.example
├── .gitignore
├── index.html
├── README.md
├── VERIFICATION.md
├── FILES.md
├── public/
│   └── .gitkeep
├── netlify/
│   ├── database/migrations/0001_initial.sql
│   ├── database/migrations/0002_brand_promotions.sql
│   └── functions/api.ts
├── server/
│   ├── db.ts
│   ├── domain.ts
│   ├── repository.ts
│   ├── auth.ts
│   └── marketing.ts
├── scripts/
│   ├── init-admin.ts
│   └── setup-local.ts
├── src/
│   ├── main.tsx
│   ├── api.ts
│   ├── shared.ts
│   ├── site.ts
│   ├── promotions.ts
│   ├── Marketing.tsx
│   ├── Footer.tsx
│   └── style.css
└── tests/
    ├── domain.test.ts
    ├── build-policy.test.ts
    ├── database.test.ts
    ├── emulator.test.ts
    ├── promotions.test.ts
    └── postgres.ts
```

`dist/` 是建置產物，`node_modules/` 是本機依賴，`.netlify/` 是 CLI 本機狀態，均不提交 Git。

前端的六條頁面路由集中於 `src/main.tsx`；API 路由集中於 `netlify/functions/api.ts`，資料交易與驗證分開在 `server/`。沒有使用瀏覽器 localStorage 作為資料庫。
