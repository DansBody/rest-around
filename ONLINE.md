# 上線版：離線收益與經濟權威

2026-10-02 討論定案，同日開始實作。

**目前進度**

| 項目 | 狀態 |
|---|---|
| 共用規則：`src/offline.js`（可覆寫參數）、`src/authority.js`（上限檢查） | 完成，`tools/test/` 有測試 |
| 資料庫：`saves`、`cap_flags`（`supabase/migrations/`） | 已套用到 Supabase |
| Edge Function `game`（login / beat / reset） | 已部署 |
| 遊戲端：`src/cloud.js`（匿名登入、心跳、單一 session） | 完成；連不上伺服器時自動改為離線遊玩 |
| 綁定帳號（`src/ui/account.js`）：Google / Email 綁定、登入其他帳號、忘記密碼、登出、Lv 3 提示 | 完成；真實的 Google 和 Email 流程待實測 |
| 好友、拜訪、幫忙與送禮：伺服器（`src/social.js`、`game` 的好友 op、四張資料表） | 完成，`tools/test/friends_smoke.js` 全部通過 |
| 好友面板（`src/ui/friends.js`）：個人資料（暱稱、頭像）、好友代碼、加好友、邀請、好友列表 | 完成 |
| 拜訪模式、幫忙的操作畫面、「誰來幫過忙」的通知卡片 | 尚未開始 |

## 範圍

上線後會有：

- 雲端存檔、多裝置
- 好友名單、拜訪好友的咖啡廳
- 幫好友的忙（餵店員、撿垃圾）、送食材，累積友好度

**不做排行榜**（2026-10-02 決定）：休閒遊戲不要有競爭。金幣也不會在玩家之間流動。

暫不考慮內購和付費貨幣；之後要加的話，需要完全由伺服器權威管理。

離線數值維持現狀（`OFFLINE` in `src/data.js`：12 小時上限、60% 效率、4 小時 = 1 遊戲日），不加變現。

## 原則

1. **時間只信伺服器。** 客戶端的 `savedAt` 只當參考，不拿來算錢。
2. **離線收益由伺服器結算。** 直接跑同一份 `src/offline.js`；它本來就是 pure function，只吃存檔 JSON。
3. **線上遊玩收益：客戶端計算，伺服器設上限。** 不把 3D 模擬搬到伺服器。
4. **只要碰到其他玩家，就由伺服器權威。** 包括幫忙、送食材和友好度。
5. **同時只允許一個 session。**

## 流程

### 遊玩中（心跳）

- 客戶端每 45 秒上傳一次存檔（`HEARTBEAT` in `src/cloud.js`），帶上 `rev` 和 `version`（`BALANCE_VERSION`）。
- 伺服器的處理：
  - 檢查 session 是否仍有效，不是的話回 409。
  - 檢查 `rev === stored.rev + 1`，不符合就回 409。
  - 把 `serverSavedAt` 和 `lastSeen` 設成伺服器時間。
  - 做**上限檢查**（見下節）。
- 分頁隱藏或關閉時（`visibilitychange`、`pagehide`），用 `fetch(..., { keepalive: true })` 再送一次存檔。不用 `sendBeacon`，因為它不能帶 `Authorization` header。就算沒送到，也只會損失最後不到 45 秒的進度。

### 登入（離線結算）

1. 建立新的 session，舊 session 立即失效。舊裝置下次心跳會收到 409，提示「已在其他裝置開啟」後重新載入。
2. 伺服器計算 `elapsed = now - lastSeen`。如果 `elapsed >= OFFLINE.minSeconds`，就執行 `settleOffline(save, elapsed, now, { seedBase: serverSavedAt })`。
3. 伺服器**先寫入**結算後的存檔（`rev + 1`，`lastSeen = now`），再回傳「存檔 + report」。同一段時間不會被付兩次。
4. 客戶端只負責套用存檔、顯示 Welcome back 卡片，不在本機再算一次。
5. 隱藏分頁超過 10 分鐘的處理維持現在的做法（重新載入），只是改成走這個登入流程。

seed 保持 deterministic，改成 `serverSavedAt ^ sec`。因為結果由伺服器算好並存起來，客戶端沒辦法反覆重試挑好結果。

伺服器連不上時（網路斷線、CDN 載入失敗），遊戲會改用本機存檔離線遊玩，並提示這段進度只會留在這台裝置上。下次連上時，以雲端存檔為準。

「重設遊戲」會呼叫 `op: 'reset'`，伺服器只接受全新的存檔（點數 0、第 1 天、財富不超過 `FRESH_WEALTH`）。

## 上限檢查（線上遊玩的收益）

實作在 `src/authority.js` 的 `capCheck(prev, next, wallSec)`。每次上傳時，拿這次的存檔和上次被接受的存檔比較，`wallSec` 是伺服器時間的間隔。

**財富（wealth）**：金幣，加上所有用金幣換來的東西，都以買價計算。包括家具、地板、壁紙、擴建、牆面裝飾、員工、食材、點心、菜色升級投入的食材，以及種在花園裡的作物（依成長進度計價）。

- 買東西只是把金幣換成物品，財富不變；賣東西只拿回一半，工資和房租會花掉金幣。所以財富只會因為營業、每日任務、每日禮物、花園和 Coin Shower 而增加。
- 財富增加超過上限：從金幣扣回超出的部分，並記一筆 flag。如果金幣不夠扣（例如憑空多出家具），整次上傳拒收（422），客戶端改用伺服器的存檔。

**上限**：用吞吐量的上界計算，不重跑模擬。

- 每秒最多能接待的客人數 = min(咖啡機、外場、座位的產能, 五星評價在最忙時段的來客數)。這個值用上次和這次的店面配置各算一次，取較大的那個。
- 每位客人以「最貴的飲料 + 最貴的甜點 + 最高小費（含 Hee Hee 的加成和 Spotlight 的雙倍） + 最貴的設施費」計算。
- 上限 = 客人數 × 1.3（`CAP.tolerance`），再加 3 位客人的寬限（`CAP.slackGuests`）。另外加上這段時間內實際完成的每日任務、實際領取的每日禮物、花園的最大產出，以及 Coin Shower 的冷卻次數。

**其他檢查**

- 點數：同樣的客人數 × 每位客人的最高點數，加上任務和菜色升級的點數。點數只會增加，不會減少。
- 評價：變化幅度不能超過 rating.js 在這段時間內能移動的量。
- 員工技能 XP：每位客人最多 16 XP，超過就回復成上次的值。
- 天數：最多 `ceil(wall / 480) + 1` 天，超過就拒收。
- 員工人數不能超過 `staffSlots`。存檔形狀不對（`badShape`）就拒收。
- 等級一律從點數重新推導，不採用客戶端上傳的值（`apply()` 已經是這樣做）。

**實測結果**：真實模擬下，以 10、45、120、600 秒的間隔各上傳一整段，正常遊玩（含領禮物、種花園）都沒有被 flag，最多只用到上限的 39%。用 `tools/test/authority_test.js` 測過的作弊情境包括：直接改金幣、憑空多出家具、跳天數、改評價和改 XP，都會被抓到。

**已知的漏洞（可接受）**：菜色等級、牆面位置這類不影響財富的欄位不檢查。線上遊玩時 debug 面板的 4× 和 16× 加速等於沒有作用，因為多賺的部分會被上限扣掉。

## 好友與互動

2026-10-02 決定。取代原本規劃的排行榜和金幣交易。

### 好友

- 每個玩家有一組好友代碼（8 碼，不含容易看錯的字元，例如 `MK7Q-2F9P`）。輸入代碼就能送出邀請，對方接受後成為好友。不提供用 email 搜尋玩家。
- 加好友前**必須先綁定帳號**。匿名帳號清掉瀏覽器資料就會消失，好友關係也會跟著不見；這個門檻也能擋掉大量開小帳號互送食材的情況。
- 好友上限 50 人。

### 個人資料

- 暱稱：最多 16 個字，留空的話好友看到的是咖啡廳名稱。
- 頭像：從自家角色（`UNIQUE_MODELS`）選一個，再選一個背景色（`social.js` 的 `AVATAR`），由伺服器檢查是否合法。
- 存在 `profiles.nickname` 和 `profiles.avatar`，用 `op: 'profile_set'` 修改。匿名帳號也可以設定，但要綁定帳號後才能加好友。

### 拜訪

- 從好友名單點進去，伺服器回傳對方最後一次存檔的快照（只限好友）。
- 你的裝置用那份快照跑模擬，客人和店員都會走動，看起來很熱鬧。但這純粹是畫面效果，不會讓任何人賺到錢，也不會改到對方的存檔。拜訪期間，自己的咖啡廳照常營業。

### 幫忙與送禮

| 動作 | 對方得到 | 自己付出 | 友好度 |
|---|---|---|---|
| 撿垃圾 | 店裡的垃圾減少（一次最多 3 個） | 無 | +1 |
| 餵店員吃點心 | 那位店員恢復體力 | 自己庫存裡的一份點心 | +2 |
| 送食材 | 食材進到對方的庫存 | 自己庫存裡的食材 | 每次 +1 |

- **幫忙的人**每次得到友好度，再加少量咖啡廳點數（例如 +3），**不給金幣**，避免互動變成刷錢的管道。
- **每日上限**依友好度等級提高（每位好友分開計算，以伺服器的日期為準）。

| 友好度等級（愛心） | 累積友好度 | 撿垃圾 | 餵點心 | 送食材 |
|---|---|---|---|---|
| 1 | 0 | 1 次 | 1 份 | 2 個 |
| 2 | 10 | 1 次 | 2 份 | 4 個 |
| 3 | 30 | 2 次 | 2 份 | 6 個 |
| 4 | 60 | 2 次 | 3 份 | 8 個 |
| 5 | 100 | 3 次 | 3 份 | 10 個 |

（數值是暫定的，實際玩過之後再調整。）

### 怎麼送到對方手上

對方可能剛好也在線上玩，所以**不能直接改對方的存檔**，不然他的下一次心跳會把改動蓋掉。

1. 幫忙的人呼叫伺服器（`op: 'help'`）。伺服器先檢查好友關係和每日上限，再確認點心或食材真的在幫忙者「上次被接受的存檔」裡，從中扣掉，並加上點數。這一步會讓幫忙者的 `rev` 加一，再把修正後的存檔回傳，幫忙者的遊戲直接套用（跟上限檢查的 `corrected` 一樣）。
2. 效果寫進收件人的信箱（`deliveries` 資料表）。
3. 收件人下次心跳或登入時，伺服器先做完上限檢查，再把信箱裡的東西合併進他的存檔（加食材、加店員體力、移除垃圾），標記為已送達，並把清單回傳。遊戲當場套用，並顯示「Mocha 的老闆來過：撿了 3 個垃圾、餵 Bbaekko 吃了一塊餅乾」。
4. 因為是伺服器在上限檢查**之後**才加進去，收到的食材不會被當成作弊扣回去。

**已知的小漏洞（可接受）：** 幫忙者的點心和食材由伺服器先從存檔扣掉，遊戲端也會跟著扣。改過的遊戲端如果不扣，下一次心跳會把那份東西「加回來」，但這也算在上限檢查的收益裡，最多只能多拿到上限內本來就允許的量。

### 資料表

| 資料表 | 內容 |
|---|---|
| `profiles` | `user_id`、`friend_code`（唯一）、咖啡廳名稱、等級（每次存檔時由伺服器更新）、暱稱、頭像 |
| `friendships` | 一對玩家（`a < b`）、狀態（pending / accepted）、誰送出邀請、友好度 |
| `help_log` | 每次幫忙的紀錄（誰、對誰、哪一天、什麼動作），用來計算每日上限 |
| `deliveries` | 收件人的信箱：寄件人、種類、內容（jsonb）、送達時間 |

這四張表一樣只開放讀取自己相關的資料，所有寫入都經過 `game` 函式。

## 平衡版本

- 伺服器和客戶端必須跑同一版的 `offline.js` 和 `data.js`，存檔記下 `balanceVersion`。
- 客戶端版本比伺服器舊時，心跳回 426，要求重新整理。
- 改平衡時：先部署伺服器，再更新客戶端。舊存檔在下一次登入結算時，會改用新版數值。

## 後端：Supabase

專案：`aizfyuioebmrhmfzsugh`（`.mcp.json`）。客戶端設定在 `src/cloud_config.js`；publishable key 本來就可以公開。

| 需求 | 對應 |
|---|---|
| 存檔、`rev`、`last_seen`、session | 資料表 `saves(user_id, data, rev, server_saved_at, last_seen, balance_version, active_session)` |
| 上限檢查的紀錄 | 資料表 `cap_flags`；首次上傳（遷移）也會記一筆 `migrated` |
| 登入結算、心跳、重設 | Edge Function `game`，用 `op` 區分：`login` / `beat` / `reset` |
| 伺服器時間 | Edge Function 內的 `Date.now()` |
| `rev` 防覆蓋 | `update ... where rev = $old and active_session = $session` |
| 好友、拜訪、幫忙 | `game` 的 `friends` / `friend_add` / `friend_accept` / `friend_remove` / `visit` / `help`；寫入透過 `game_commit`、`game_help` 兩個 Postgres 函式，每次都在同一個 transaction 裡完成 |

**RLS 規則：** `saves` 只開放 `select` 自己那一筆，`cap_flags` 完全不開放。所有寫入一律經過 Edge Function（使用 secret key），否則上限檢查會被直接繞過。這個專案預設不會把資料表權限開給 API 角色，所以需要的權限都要在 migration 裡明確 `grant`。

**`game` 的回應：** 401 未登入；409 `session` 已在其他裝置開啟（客戶端暫停並提示重新載入）；409 `rev` 存檔版本不符（重新載入）；422 這次上傳無法修正（重新載入）；426 遊戲版本比伺服器舊（提示重新載入）。

**共用程式碼與部署：** `offline.js`、`authority.js` 和 `data.js`（以及它們 import 的 `rating.js`、`pantry.js`、`util.js`）是純 ES module，伺服器直接打包同一份。這幾個檔案要一直保持不在最外層碰 DOM、`window` 和 localStorage。

部署（CLI 已登入，會自動帶上 `index.ts` import 到的 `src/` 檔案，不需要另外打包）：

```
npx supabase functions deploy game --project-ref aizfyuioebmrhmfzsugh --use-api --no-verify-jwt
```

`--no-verify-jwt` 是必要的：函式自己用 `getClaims` 驗證使用者。CLI 不能用的時候，備案是 `node tools/build_functions.js` 打包成單一檔案（`build/functions/game/index.js`），再用 Supabase MCP 的 `deploy_edge_function` 上傳。

**改平衡時：** 先把 `BALANCE_VERSION` 加一並部署伺服器，再更新遊戲。

**測試：**

```
node tools/test/offline_snapshot.js   # 改 offline.js / data.js 前後各跑一次並比對輸出，確認數值沒有被意外改動
node tools/test/authority_test.js     # 上限檢查
node tools/test/server_smoke.js       # 對已部署的伺服器跑一次完整流程（會留下一個匿名測試帳號）
node tools/test/social_test.js        # 幫忙與送禮的規則
node tools/test/friends_smoke.js setup   # 好友流程：先建兩個測試帳號，再依指示用 SQL 標成已綁定
node tools/test/friends_smoke.js run
```

**費用：** 免費方案的登入人數夠用（約每月 50,000 個活躍使用者），但閒置約一週會自動暫停，正式上線時要升級 Pro（約每月 25 美元）。

## 帳號與登入

### 登入方式

| 方式 | 何時做 | 費用 |
|---|---|---|
| 匿名登入 | 一開始就做，打開遊戲就自動登入 | 免費 |
| email + 密碼 | 一開始就做，用來綁定匿名帳號 | 免費（需要 SMTP） |
| Google | 一開始就做 | 免費 |
| Apple | 上 iOS App Store 時再做 | Apple Developer 每年 99 美元 |
| 簡訊驗證碼 | 不做 | 每封都要付費 |

- 正式上線要接自己的 SMTP，用 Resend 免費額度即可。Supabase 內建的寄信額度只夠開發用，而驗證信和忘記密碼的信都要寄。
- 匿名登入要開 CAPTCHA（Cloudflare Turnstile，免費），防止有人大量洗帳號。

### 匿名帳號升級（換裝置繼續玩）

1. 第一次打開遊戲時呼叫 `signInAnonymously()`，直接開始玩。
2. 玩家點「綁定帳號」並輸入 email 後，呼叫 `updateUser({ email })`，Supabase 會寄出驗證信。
3. 玩家點信裡的連結確認後，呼叫 `updateUser({ password })` 設定密碼。
4. Google 綁定用 `linkIdentity()`。同一個帳號可以同時有 email 密碼和 Google 兩種登入方式。
5. 整個過程 `user_id` 都不變，存檔不需要搬移。

**email 已被其他帳號使用時：** 綁定會失敗。這時讓玩家選擇「登入那個帳號」，並明確告知這台裝置上的匿名進度會被放棄。兩份進度不做合併。

### 實作備註

- Google 綁定用 `linkIdentity()`，需要在 Supabase 打開 **Allow manual linking**。Google OAuth client 的重新導向 URI 是 `https://aizfyuioebmrhmfzsugh.supabase.co/auth/v1/callback`。
- Email 綁定：`updateUser({ email })` 寄出確認信。玩家點連結回到遊戲後，會跳出設定密碼的視窗；設定時順便寫入 `user_metadata.has_password`，用來判斷是否還沒設密碼。
- Google 或 Email 已經被別的帳號使用（`identity_already_exists` / `email_exists`）時，會跳出「已經有人使用」的視窗，讓玩家選擇登入那個帳號，或保留目前這間咖啡廳。
- 本機存檔會用 `restAround.save.v1.owner` 記錄是哪個帳號的，只有同一個帳號（或上線前的舊存檔）才會被當成遷移資料上傳。避免切換帳號時，把別人的進度帶進新帳號。
- 登出時會清掉本機存檔，下次打開遊戲會是新的匿名咖啡廳。
- 上線網址（例如 Cloudflare Pages）要加到 Supabase 的 **URL Configuration**（Site URL 和 Redirect URLs）。

### 什麼時候提醒玩家綁定

- 不在一開始要求綁定，先讓玩家玩。
- 到達 Lv 3 時，提示一次：「綁定帳號，換裝置也能繼續玩」。
- 第一次加好友時，**必須**先綁定。
- 設定頁一直放著「綁定帳號」按鈕。還沒綁定的話顯示警告：清除瀏覽器資料後進度會遺失。

### 現有本機存檔的遷移

第一次上線時，客戶端會先匿名登入，再把 localStorage 裡的存檔上傳成 `rev 1`。上傳成功後，本機改為只保留快取。

## 已決定（2026-10-02）

- 遷移的那一份本機存檔：直接信任，但在 `cap_flags` 記一筆 `migrated`，留下當時的財富和點數。加好友需要綁定帳號，所以遷移的存檔不會直接影響到別人。
- ~~交易的內容：先只開放金幣。~~ 改為不做金幣交易，見「好友與互動」。
- 上限倍率：維持 1.3。實測正常遊玩最多只用到上限的 39%。
