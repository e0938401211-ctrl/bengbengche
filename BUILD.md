# 程式碼保護（打亂）說明

網站上的 data.js / driver.js / admin.js 是「打亂過」的版本，別人很難看懂或複製。
看得懂的原始碼放在 src/ 資料夾。

## 要改功能時
1. 改 `src/data.js`、`src/driver.js` 或 `src/admin.js`（看得懂的版本）
2. 執行 `node build.js`（把 src/ 打亂後輸出到根目錄）
3. 更新 HTML 的 ?v= 版本號，git push

## 第一次在新環境
`npm install`（安裝打亂工具 javascript-obfuscator）
