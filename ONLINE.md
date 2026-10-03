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
| 拜訪模式（`src/ui/visit.js`）：另外跑一個 Game 只用來看，畫面切過去，自己的店在背景照常營業和心跳 | 完成；用「拉鐵」帳號實際拜訪過安妮 |
| 好友按鈕改成右上角的懸浮按鈕；320px 手機到桌機都不重疊、不超出畫面 | 完成 |
| 幫忙的操作（拜訪橫幅的三個按鈕，或直接點對方的店員、垃圾）、「朋友來幫忙了」卡片 | 完成；撿垃圾用「拉鐵」帳號實測過，餵點心和送食材用假的伺服器回應測過畫面 |
| 開始畫面（`src/ui/welcome.js`）：載入後選「開始經營我的咖啡廳」（訪客）或用 Google / Email 登入 | 完成；訪客和 Email 錯誤處理測過，真實的 Google 登入待實測 |

## 下一步（交接）

2026-10-02 做完好友功能（拜訪、幫忙）和開始畫面，遊戲端的線上功能主線告一段落。剩下的事情依建議順序排列。

**2026-10-03：A1 部署完成（https://refillit.pages.dev），下次從 A1 的收尾和 A2 開始。**

### A. 上線一定要做的（大多是後台設定，需要使用者操作；Claude 負責寫操作說明和遊戲端的程式）

1. ✅ **部署**（2026-10-03 上線：https://refillit.pages.dev）：放到正式網址。網址要加到 Supabase 的 **URL Configuration**（Site URL、Redirect URLs）和 Google OAuth client 的允許來源，不然 Google 登入和信裡的連結會跳回 localhost。
   - 2026-10-03 決定用 Cloudflare Pages（免費方案），連 GitHub repo `DansBody/rest-around` 自動部署。Build command `node tools/build_site.js`，output `dist`（只放 `index.html`、`src`、`assets`、`vendor`）。本機可用 launch.json 的 `dist` 預覽。
   - 部署前，`game` 函式要先用同一版 `BALANCE_VERSION` 部署好，不然遊戲會一直收到 426。
   - push 到 production branch 後約 30 秒上線。確認方式：`curl https://refillit.pages.dev/src/<檔案>` 看有沒有這次改的字。
   - Git 連線斷掉時：GitHub → Settings → Applications → Installed GitHub Apps → **Cloudflare Workers and Pages** → Configure，確認 repository access 有 `rest-around`；再到 Pages 專案的 Build 設定重新連 repo。
   - **還沒做（使用者）**：Supabase → Authentication → URL Configuration：Site URL 改成 `https://refillit.pages.dev`，Redirect URLs 加 `https://refillit.pages.dev/**`（localhost 的保留）。Google OAuth client 的 Authorized JavaScript origins 加 `https://refillit.pages.dev`（redirect URI 不變）。做完用手機試一次 Google 登入，確認跳回 refillit.pages.dev。
2. **SMTP**（下一個）：接 Resend，換掉 Supabase 內建的寄信（額度只夠開發用）。確認信和忘記密碼的信都靠它。
   - 先決條件：要有自己的網域。Resend 只能從驗證過的網域寄信，`pages.dev` 不能用。網域可以順便當遊戲的正式網址（Cloudflare Pages → Custom domains）。
   - 步驟：Resend 註冊 → Domains 加網域，把它給的 DNS 記錄（SPF、DKIM，建議加 DMARC）加到網域的 DNS → 建 API key → Supabase → Authentication → SMTP Settings：host `smtp.resend.com`、port `465`、username `resend`、password 填 API key、寄件人例如 `noreply@<網域>`，名稱 `Refillit`。
   - 之後順便調 Supabase 的 Auth rate limit（內建 SMTP 時每小時只能寄很少封），並把確認信、重設密碼信的範本改成中文。
   - 測試：用新的 Email 綁定一次（收確認信）、忘記密碼一次，確認信的連結都回到正式網址。
3. **Turnstile**：匿名登入加 CAPTCHA，防止有人用程式大量建帳號。後台打開 Supabase 的 CAPTCHA 設定；遊戲端要在開始畫面按「開始經營我的咖啡廳」時先過驗證，再把 token 傳給 `signInAnonymously({ options: { captchaToken } })`（Email 登入也要帶）。
4. **Google OAuth 發布**：同意畫面目前應該還是「測試」狀態，只有名單上的帳號能登入。要準備隱私權政策頁面、應用程式首頁，送 Google 審核後改成正式發布。
5. **升級 Supabase Pro**：免費方案閒置約一週會暫停（約每月 25 美元）。
6. **Leaked password protection**：Supabase 安全檢查提醒尚未開啟（Auth → 密碼設定），開啟後會擋掉外洩過的密碼。

### B. 需要使用者實際操作一次的實測

- 真實的 Google 綁定、Google 登入（含開始畫面）。
- Email 綁定：確認信 → 設定密碼 → 忘記密碼。
- 收到好友幫忙的「朋友來幫忙了」卡片：安妮的信箱裡有一筆「拉鐵」撿垃圾的 delivery，但測試帳號不會登入，所以沒有真的送達過。要測的話，用 SQL 在 `deliveries` 插一筆寄給「拉鐵」的（`to_user` = 拉鐵 `735c88cb-a777-4276-bac9-504440596dc2`、`from_user` = 安妮），再重新整理遊戲。
- 兩台裝置同時開：舊的那台要出現「已在其他裝置開啟」。

### C. 功能缺口（遊戲端或伺服器，Claude 可以直接做）

- **刪除帳號**：設定裡加「刪除帳號」，伺服器刪掉 `saves`、`profiles`、好友關係、信箱和 auth 使用者。要上 iOS App Store 的話，Apple 規定 App 內一定要有；個資法規通常也要求。
- **好友邀請的紅點**：好友按鈕的紅點現在要打開過一次好友面板才會出現。改成登入後先抓一次 `friends`，之後每隔幾分鐘再抓。
- **清理沒人用的資料**：被放棄的匿名帳號和存檔會一直累積，再也不會登入的玩家，信箱裡的幫忙也一樣。可以用 `pg_cron` 定期清理，例如超過 90 天沒登入的匿名帳號，以及送不出去的 delivery。
- **作弊紀錄的查看方式**：`cap_flags` 目前只能直接查資料庫，之後可以做一個簡單的查看頁面。可以晚點做。
- **Apple 登入**：上 iOS 時再做。

### D. 小修

- 補索引：`deliveries.from_user`、`help_log.target`（Supabase 效能檢查的 unindexed foreign keys），寫一個 migration。
- 好友互動的數值（每日上限、友好度、幫忙者 +3 點）實際玩過後再調。
- `cap_flags` id 16（拉鐵，rev 52 的 `points`）是 2026-10-02 測試時造成的，不是作弊，可以忽略。

**測試用的好友：** 已經和使用者的 Google 帳號（暱稱「拉鐵」）互為好友，可以直接拿來測拜訪和幫忙。

| 暱稱 | 咖啡廳 | 好友代碼 | user_id |
|---|---|---|---|
| 安妮 | Test A（Lv 6，大店，有 5 位店員） | `FHBA-H4SV` | `3d8c4cfb-0963-4812-8afc-8016cfd64483` |
| 熊熊店長 | Test B（Lv 1，小店） | `TMTN-BSK5` | `9adecad0-345a-4904-b4e3-3ffd15a11d6b` |

這兩個是用 `tools/test/friends_smoke.js` 建立的匿名帳號，再用 SQL 把 `is_anonymous` 改成 false，所以沒有登入方式；要從它們那一邊操作的話，直接改資料庫。

## 範圍

上線後會有：

- 雲端存檔、多裝置
- 好友名單、拜訪好友的咖啡廳
- 幫好友的忙（餵店員、撿垃圾）、送食材，累積友好度

**不做排行榜**（2026-10-02 決定）：休閒遊戲不要有競爭。金幣也不會在玩家之間流動。

暫不考慮內購和付費貨幣；之後要加的話，需要完全由伺服器權威管理。

離線數值維持現狀（`OFFLINE` in `src/data.js`：12 小時上限、60% 效率、每 4 小時算 1 個「模型日」，也就是舊版 8 分鐘一天的營業量），不加變現。2026-10-03 改成跟著現實時鐘的輪次以後，離線每小時的收益沒有變。

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

「重設遊戲」會呼叫 `op: 'reset'`，伺服器只接受全新的存檔（點數 0、財富不超過 `FRESH_WEALTH`）。

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
- 輪次（2026-10-03 起取代天數）：`state.round` 跟著現實時鐘走，一輪 `DAY.round` = 7200 秒，最多前進 `ceil(wall / 7200) + 1` 輪；`state.tz` 改變時（換時區）再多容許 13 輪。超過就拒收。每日任務和每日禮物以玩家本地的日曆日計算，一次上傳最多各算 `floor(wall / 86400) + 1` 次。
- 員工人數不能超過 `staffSlots`。存檔形狀不對（`badShape`）就拒收。
- 等級一律從點數重新推導，不採用客戶端上傳的值（`apply()` 已經是這樣做）。

**實測結果**：真實模擬下，以 10、45、120、600 秒的間隔各上傳一整段，正常遊玩（含領禮物、種花園）都沒有被 flag，最多只用到上限的 39%。用 `tools/test/authority_test.js` 測過的作弊情境包括：直接改金幣、憑空多出家具、跳輪次、改評價和改 XP，都會被抓到。

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

**實作（Step 3）：** 拜訪時另外建一個 `Game`（`game.visit = true`），用 `apply()` 套上對方的存檔，每一幀和自己的 Game 一起 update；`Renderer.show(game)` 把畫面切過去（清掉舊的家具、角色、垃圾，下一幀重建房間）。
- 只有畫面上的那間店會發出音效和場景特效（`game.shown`）；只有自己的店會通知 HUD、面板和卡片（`Game.emit`）。所以對方的店不會跳 toast、日結卡片或升級動畫，自己的店在背景的日結卡片照常排隊。
- 對方的店一天結束時直接開下一天。賺到的錢只留在那個暫時的 Game 裡，回家時整個丟掉。
- 切換時有全螢幕的轉場（`#visitcover`）：「正在前往 安妮 的店…」，回家時是「正在回到 Sunny Café…」。至少停留一小段時間讓字讀得到，等伺服器回應、新的店畫好之後才淡出；拜訪失敗時淡出後跳 toast。
- 拜訪中隱藏自己的 HUD 和工具列，改顯示拜訪橫幅（對方暱稱、咖啡廳、愛心、今天還能幫的次數、「回到我的店」）。鏡頭操作跟著畫面上的店；Esc 也能回家。

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

**實作（Step 4，`src/ui/visit.js`）：** 拜訪橫幅下方有三個按鈕（撿垃圾、餵點心、送食材），各自標出今天還剩幾次，用完會打勾。也可以直接點畫面：點對方的店員會打開餵點心的卡片，並先選好那位店員；點垃圾（或旁邊一格）就撿起來。
- `cloud.help()` 會**先上傳一次存檔**，再呼叫 `help`。因為伺服器是拿「上次被接受的存檔」扣東西，並把伺服器時鐘重設成現在；如果不先上傳，最近一次心跳之後賺到的錢，會在下一次心跳被上限檢查扣掉。中間剛好插進一次心跳、`rev` 對不上時，會再上傳一次並重試。
- 成功後，遊戲端扣掉同樣的點心或食材、加上 `FRIENDS.helperPoints` 點，並在對方的店裡播出效果（垃圾消失、店員吃點心、門口跳出食材）。
- 收到幫忙時（登入或心跳的 `incoming`），排一張「朋友來幫忙了」卡片，依好友分組列出做了什麼。登入時會排在「歡迎回來」卡片之後。
- 拜訪時 toast 會移到畫面下方，不蓋住拜訪橫幅。

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

這四張表都開了 RLS 但沒有任何 policy，所以客戶端完全讀不到也寫不了，讀寫一律經過 `game` 函式（Supabase 的安全檢查會列為 INFO「RLS Enabled No Policy」，這是刻意的）。

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
| 匿名登入 | 一開始就做，在開始畫面選「開始經營我的咖啡廳」 | 免費 |
| email + 密碼 | 一開始就做，用來綁定匿名帳號 | 免費（需要 SMTP） |
| Google | 一開始就做 | 免費 |
| Apple | 上 iOS App Store 時再做 | Apple Developer 每年 99 美元 |
| 簡訊驗證碼 | 不做 | 每封都要付費 |

- 正式上線要接自己的 SMTP，用 Resend 免費額度即可。Supabase 內建的寄信額度只夠開發用，而驗證信和忘記密碼的信都要寄。
- 匿名登入要開 CAPTCHA（Cloudflare Turnstile，免費），防止有人大量洗帳號。

### 匿名帳號升級（換裝置繼續玩）

1. 第一次打開遊戲時，在開始畫面按「開始經營我的咖啡廳」，呼叫 `signInAnonymously()`，直接開始玩。
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
- **開始畫面**（`src/ui/welcome.js`，2026-10-02 加入）：載入完之後，如果這個瀏覽器還沒有登入紀錄，會在載入卡片裡顯示三個選項。最大的按鈕是「開始經營我的咖啡廳」（訪客，和以前一樣馬上能玩），下面是「已經有咖啡廳了？」的「使用 Google 登入」和「用 Email 登入」。這樣在新裝置上的老玩家能直接回到自己的店，不會先多建一間空的匿名咖啡廳。
  - 已經有登入紀錄就跳過，直接開店。`navigator.onLine` 是 false 時也跳過，改用離線遊玩。
  - 從 Google 回來時已經登入了，所以不會再出現；Google 那邊出錯（例如取消）時，會回到開始畫面並顯示錯誤。
  - 這台瀏覽器有上線前的本機存檔（沒有 `owner`）時，會說明：按開始會繼續經營它，登入帳號則會改開帳號裡的那一間。
- 到達 Lv 3 時，提示一次：「綁定帳號，換裝置也能繼續玩」。
- 第一次加好友時，**必須**先綁定。
- 設定頁一直放著「綁定帳號」按鈕。還沒綁定的話顯示警告：清除瀏覽器資料後進度會遺失。

### 現有本機存檔的遷移

第一次上線時，客戶端會先匿名登入，再把 localStorage 裡的存檔上傳成 `rev 1`。上傳成功後，本機改為只保留快取。

## 已決定（2026-10-02）

- 遷移的那一份本機存檔：直接信任，但在 `cap_flags` 記一筆 `migrated`，留下當時的財富和點數。加好友需要綁定帳號，所以遷移的存檔不會直接影響到別人。
- ~~交易的內容：先只開放金幣。~~ 改為不做金幣交易，見「好友與互動」。
- 上限倍率：維持 1.3。實測正常遊玩最多只用到上限的 39%。
