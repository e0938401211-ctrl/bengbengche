# 蹦蹦車

| 頁面 | 網址 | 用途 |
|---|---|---|
| 司機 App | `https://e0938401211-ctrl.github.io/bengbengche/` | 司機登入、上線、接單、跳表 |
| 管理平台 | `https://e0938401211-ctrl.github.io/bengbengche/admin.html` | 管理員登入、手動派單、司機動態、帳號管理 |

管理平台第一次登入：帳號 `admin`，密碼 `123456`，登入後請立刻修改密碼。

## 連線模式

- **示範模式**（`config.js` 是 `null`）：資料只存在瀏覽器裡，只有同一個瀏覽器的分頁會互相連動。
- **雲端模式**（`config.js` 填入 Firebase 設定）：不同手機、不同電腦都會即時連動。

## 設定 Firebase（約 10 分鐘）

1. 打開 https://console.firebase.google.com ，用 Google 帳號登入，按「建立專案」，名稱填 `bengbengche`，Google Analytics 可以關掉。
2. 左邊選單「建構 → Firestore Database」→「建立資料庫」→ 位置選 `asia-east1（台灣）`→ 選「以正式版模式啟動」→ 建立。
3. 在 Firestore 頁面點「規則」分頁，把 `firestore.rules` 的內容整段貼上，按「發布」。
4. 左上角齒輪 →「專案設定」→ 往下到「你的應用程式」→ 點 `</>`（網頁）→ 暱稱填 `bengbengche` → 註冊。
5. 複製畫面上 `const firebaseConfig = { ... }` 大括號裡的內容，貼到 `config.js`，取代 `null`。

## 檔案

- `index.html`、`driver.js`：司機 App
- `admin.html`、`admin.js`：管理平台
- `data.js`：共用資料層（Firebase／示範模式、高雄地標、計價）
- `config.js`：Firebase 設定
- `firestore.rules`：Firestore 安全規則（測試用）

## 安全提醒

目前是測試版：密碼有加密雜湊，但資料庫規則是開放的，知道網址的人技術上可以讀寫資料。正式營運前需要改用 Firebase Authentication 並收緊規則。
