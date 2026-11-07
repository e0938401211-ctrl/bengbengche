// 蹦蹦車 程式碼保護：把 src/ 裡看得懂的原始碼打亂後輸出到根目錄，
// 網站載入的是打亂版，別人很難看懂或複製。修改功能時改 src/ 再執行：node build.js
const fs = require('fs');
const path = require('path');
const JO = require('javascript-obfuscator');

const FILES = ['data.js', 'driver.js', 'admin.js'];
const opts = {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',   // 變數名稱改成 _0x 開頭的亂碼
  renameGlobals: false,                      // 不改全域名稱，免得 window.BBC 等對外介面壞掉
  stringArray: true,                         // 把字串收進一個陣列再打亂
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: 'function',
  splitStrings: true,
  splitStringsChunkLength: 8,
  numbersToExpressions: true,
  transformObjectKeys: false,                // 保留物件鍵名，免得 Firebase 欄位名被改掉
  unicodeEscapeSequence: false,
  controlFlowFlattening: false,              // 不開（手機上會變慢）
  deadCodeInjection: false,
  selfDefending: false,                      // 不開（有時會誤擋正常執行）
  debugProtection: false,
  disableConsoleOutput: false
};

let total = 0;
for (const f of FILES) {
  const srcPath = path.join('src', f);
  const code = fs.readFileSync(srcPath, 'utf8');
  const out = JO.obfuscate(code, opts).getObfuscatedCode();
  fs.writeFileSync(f, out);
  const before = Buffer.byteLength(code), after = Buffer.byteLength(out);
  total += after;
  console.log(`${f}: ${(before/1024).toFixed(0)}KB → ${(after/1024).toFixed(0)}KB`);
}
console.log(`完成，共 ${(total/1024).toFixed(0)}KB`);
