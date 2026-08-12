# W3:Ride — client/server API surface & data model (reverse-engineered)

Source artifacts (read-only):
- `/Users/jannisdeters/Downloads/W3%3ARide_0/resources/assets/index.android.bundle` (13 MB, RN/Expo SDK 49, minified but unobfuscated string literals)
- `/Users/jannisdeters/Downloads/W3%3ARide_0/resources/assets/app.config`
- `/Users/jannisdeters/Downloads/W3%3ARide_0/resources/AndroidManifest.xml`

App version **0.14.6**, package `io.w3ride.w3ride`, Expo SDK 49, scheme `w3ride://`.

Everything below marked **[E]** is hard evidence (quoted from the bundle). **[I]** is inference.

---

## 1. Base URLs / environments

**[E]** `app.config`:

```json
"extra":{"apiUrl":"https://service.w3ride.io/api/",
 "auth0Audience":"https://w3ride.io/api",
 "auth0ClientId":"<redacted — public SPA client id constant is present>",
 "auth0Domain":"w3ride-prod.us.auth0.com",
 "googleClientId":"<redacted — present>",
 "stravaClientId":"<redacted — present>",
 "stravaRedirectUri":"w3ride://settings",
 "eas":{"projectId":"c99c56e3-…"},"version":"0.14.6"}
```

**[E]** The single axios instance (bundle module 1269):

```js
e.handleApiError=e.api=void 0;
var o = Constants.manifest.extra?.apiUrl,
    u = axios.create({baseURL:o});
e.api=u;
e.handleApiError=function(n){
  return n.response?.data?.message ? n.response.data.message
       : n.request ? 'No response received.'
       : n.message ? n.message : 'Something went wrong.'}
```

Other hosts seen:
- **[E]** `https://support.w3ride.io/hc/en-us/sections/7076759460765-FAQ` (Zendesk help centre)
- **[E]** `app.w3ride.io` — referenced as text only: *"Go to our website **app.w3ride.io** on a desktop browser, and link your W3:Ride account to your NFT wallets."* Wallet linking is a **web-only** flow; the app never links wallets.
- **[E]** `https://w3ride-nexus.infura-ipfs.io/ipfs/<CID>` — NFT artwork, used as hard-coded sample images in a promo carousel.
- **[E]** `https://u.expo.dev/c99c56e3-…` — Expo OTA updates.
- **[E]** `https://whitepaper.cyclernft.com/` — linked from Settings.
- **[E]** Auth0: `w3ride-prod.us.auth0.com`; Strava OAuth endpoints `https://www.strava.com/oauth/{mobile/authorize,token,deauthorize}`.

**Only one environment is present in the shipped bundle: production.** No staging/QA/dev host strings found (`grep` for `staging|qa\.|dev\.` returns only unrelated matches). `apiUrl` is read from the Expo manifest at runtime, so environments are swapped at build time, not in code.

---

## 2. Transport

**REST over HTTPS, JSON, axios.** **Not GraphQL** — the bundle has zero `operationName`, zero `gql`/`apollo`/`urql`/`relay` references; the only `graphql` hits (2) and `__typename` hits (10) are inside unrelated vendor code.

**[E]** Usage census of the api client across the whole bundle:

| verb | count |
|---|---|
| `api.get` | 46 |
| `api.post` | 30 |
| `api.put` | 3 |
| `api.patch` | 1 |
| `api.delete` | 1 |
| `api.interceptors` | 1 |
| `api.defaults` | 1 |

Paths are **relative** (no leading slash) and are appended to the `…/api/` baseURL, e.g. `api.get('user/current')` → `https://service.w3ride.io/api/user/current`.

**No websockets.** `wss://`, `socket.io`, `SignalR`, `new WebSocket(` — all absent.

**Interceptors** — only one, and it is *error reporting*, not auth refresh:

```js
api.interceptors.response.use(t=>t, t=>{
  axios.isAxiosError(t) && t.config.url && !t.config.url.toLowerCase().includes('log')
    && Logger.onError(t);
  return Promise.reject(t)})
```

State layer is **Redux Toolkit**; every endpoint is wrapped in a `createAsyncThunk`, which makes the endpoint↔payload mapping unusually legible.

---

## 3. Endpoint catalogue

All verified **[E]** by quoted call sites. Grouped by domain. `{}` = path parameter.

### Auth / identity
| Method | Path | Notes |
|---|---|---|
| GET | `user/current` | current user profile (`getUser`) |
| PATCH | `user/current` | update profile (`updateUser`, body echoed back) |
| DELETE | `user/current` | account deletion, then local Auth0 logout |
| GET | `user/current/summary` | dashboard aggregate (balances, lifetime stats, badges, connections) |
| PUT | `user/current/tier` | `upgradeUserTier` (no body) |
| GET | `user/current/challenge?tierId=` | tier challenges |
| GET | `user/current/leaderboard?nearest=&days=&take=&orderBy=` | leaderboard |
| POST | `user/current/share` | share event log, body `{description, rawJson}` |
| GET | `lookup/country?skip=&take=&term=` | |
| GET | `lookup/gender` | |
| POST | `activity/onboarding/step` | body `{onboardingStep}` |
| POST | `log` | client log sink, body `{logLevel, message, rawJson}` |

### Fitness connections
| Method | Path | Notes |
|---|---|---|
| GET | `user/connections` | user's connected trackers |
| GET | `user/connections/types/{platform}` | `Platform.OS` (`ios`/`android`) as the segment |
| GET | `user/connection/{connectionType}/url` | **server-issued OAuth authorize URL** |
| POST | `user/connection/{connectionType}/mark` | mark HealthKit connected (empty body, explicit `Content-Type: application/json`) |
| POST | `user/connection/{userConnectionId}/disconnect` | |

### Rides
| Method | Path | Notes |
|---|---|---|
| GET | `ride?pending=&expired=&from=&to=&skip=&take=&distanceUnit=` | one endpoint, three views (new / expired / past) |
| GET | `ride/week` | rides included in the current week |
| GET | `ride/include` | quota info (`ridesToInclude`, `ridesToRecycle`, `nextRecycleOn`) |
| POST | `ride/include` | **array** body — include / exclude / recycle |
| POST | `ride/import/apple` | raw HealthKit workout samples |
| POST | `ride/import/google` | *defined but never dispatched* — see §5 |
| POST | `ride/import/strava` | *defined but never dispatched* — see §5 |

### NFT assets (bikes / riders)
| Method | Path | Notes |
|---|---|---|
| GET | `user/current/bike?skip=&take=` | paged, `{count, items}` |
| PUT | `user/current/bike/{bikeId}` | select active bike |
| GET | `user/current/rider?skip=&take=` | |
| PUT | `user/current/rider/{riderId}` | select active rider |

### Wallet / ledger
| Method | Path | Notes |
|---|---|---|
| GET | `wallet` | list of wallets |
| GET | `transaction` | full transaction history |
| POST | `transaction/power/convert` | $POWER → $CYCLR conversion |
| GET | `settings/convertpowrtocyclr` | `{label, exchangeRate}` |


`getAllSettings` is **not** a separate endpoint — **[E]** it is a fan-out thunk whose entire body is `await dispatch(getConvertPowerToCyclrSettings())`.

### Commerce / marketplace
| Method | Path | Notes |
|---|---|---|
| GET | `commerce/bundles` | |
| GET | `commerce/bundle/{id}` | |
| GET | `commerce/bundles/inAppIds` | maps bundles → store SKUs |
| POST | `commerce/payment/intent` | returns `{isSuccess, message, clientSecret, paymentGuid}` |
| POST | `commerce/payment/inapp` | IAP receipt validation |
| GET | `commerce/payment/{paymentGuid}/status` | |
| POST | `commerce/payment/{paymentGuid}/complete` | |
| POST | `commerce/payment/{paymentGuid}/cancel` | |
| POST | `commerce/payment/{paymentGuid}/reject` | |

### Campaigns (raffles, merch, partner offers)
| Method | Path | Notes |
|---|---|---|
| GET | `campaign?status=&provider=` | |
| GET | `campaign/{campaignId}` | |
| GET | `campaign/type` | |
| GET | `campaign/{campaignId}/inventory` | |
| POST | `campaign/{campaignId}/enter` | body `{entries, products}` |
| POST | `campaign/{campaignId}/discount/{discountId}` | claim discount |
| GET | `campaign/provider/{providerType}/account` | |
| POST | `campaign/provider/{providerType}/account` | |

### Events / maps / routes (virtual challenge layer)
| Method | Path | Notes |
|---|---|---|
| GET | `event` | |
| GET | `event/{id}` | |
| POST | `event/{id}/enter` | |
| GET | `event/{id}/map` | maps belonging to an event |
| GET | `map/{id}` | |
| GET | `map/{id}/route?distanceUnit=` | |
| GET | `map/{id}/package?distanceUnit=` | purchasable map packages |
| POST | `map/{mapId}/enter` | body `{codeValue, transactionId, packageId}` |
| POST | `map/{id}/claim` | claim map reward |
| GET | `route/{id}?distanceUnit=` | |
| POST | `route/{id}/enter` | |

### Social / referral
| Method | Path | Notes |
|---|---|---|
| GET | `user/referralCode` | own code |
| POST | `user/referralCode/{CODE}` | redeem a code (uppercased, trimmed client-side) |
| POST | `user/referralCode/verify/{CODE}` | pre-flight validation |
| GET | `user/referrals` | referrer-side status |
| GET | `user/userReferral` | invitee-side record |
| POST | `user/userReferral/{id}/claim/referrer` | |
| POST | `user/userReferral/{id}/claim/referral` | |
| GET | `community/challenges` | |

### Notifications
| Method | Path | Notes |
|---|---|---|
| GET | `notification?new=true|false&…` | |
| GET | `notification/{id}` | |
| GET | `notification/new/count` | |
| POST | `notification/{id}/seen` | |
| POST | `notification/expo/token` | Expo push token, explicit `Content-Type: application/json` |

---

## 4. Request / response shapes

Pagination is a consistent envelope: **[E]** reducers read `payload.count` and `payload.items` (`ride`, `user/current/bike`, `user/current/rider`, `lookup/country`, `notification`). Query params `skip` / `take`.

### User / Profile
**[E]** Redux `user` slice initial state and the `getUser`/`getUserSummary` reducers give the server field names:

```js
// initial state
{ridesCount, ridesLeftCount:0, token:'', userGuid:undefined, userName:'', firstName:'',
 lastName:'', timeZone:'', confirmedTier:{tierId:0,tierName:''}, tierChallenges:[],
 leaderBoard:[], lifetimePowerEarned:0, lifetimeRideDistance:0, lifetimeRideDuration:0,
 lifetimeRideCount:0, hasLoggedOut:false, referralCode:undefined, country:undefined,
 referral:undefined, verified:false, triedLogin:false, isOnboarded:undefined,
 completedOnboardingStep:undefined}
```

`GET user/current` → **[E]** `userGuid, userName, confirmedTier, eligibleTier, country, isOnboarded, completedOnboardingStep, gender`

`GET user/current/summary` → **[E]** `ridesLeftCount, balances[], lifetimeStats{powerEarned, distance, duration, rideCount}, connections[], badges[]`

Tier: `{tierId, tierName}`. Badge: **[E]** `{id, badgeName, awardDate}` (an un-awarded badge has no `awardDate`).

Fitness connection object: **[E]** `{connectionType, userConnectionId, isAvailableOnPlatform}`.

### Ride / Activity
**[E]** A literal placeholder Ride object in the dashboard code spells the DTO out:

```js
{rideId:1, distance:1.5, distanceUnit:'Km', duration:600, sourceTypeId:1,
 timeStamp:DateTime.utc().toISO(), displayAverageSpeed:'12 Km/h', displayDistance:1.5,
 isIncluded:false, isInvalid:false, isPending:true, powerEarned:100}
```

Additional ride fields observed in reducers/UI: **[E]** `isRecycled`, `recyclePercentage`, `isExpired` (implied by the `expired` query flag).

**There is no GPS, no route geometry, no HR/cadence/power/elevation on the Ride object.** Greps for `latitude:` / `longitude:` / `polyline` / `cadence` / `heartRate` / `averageSpeed` / `calories` hit only icon-name tables and SVG element maps. `elevation:` hits are all React Native shadow styles.

`ride/include` request body: **[E]** `[{rideId, isIncluded:true}]`, `[{rideId, isIncluded:false}]`, or `[{rideId, isRecycled:true}]`. Response is the same array shape back; the client treats an empty array as failure.

`ride/include` (GET) → **[E]** `{ridesToInclude, ridesToRecycle, nextRecycleOn}`.

Standard ride list requests **[E]**:
```js
NewRidesRequest      = {pending:true,  expired:false, from:<utcNow-10d>, skip:0, take:100, distanceUnit}
ExpiredRidesRequest  = {pending:false, expired:true,  from:<utcNow-17d>, to:<utcNow-10d>, skip:0, take:100, distanceUnit}
```
(`from` is `HealthService.getStartDate()` = `DateTime.utc().minus({days:10})`; the expired window is that minus a further 7 days.)

### Bike / Rider (NFT)
**[E]** Server "display asset" → client mapping:
```js
displayAssetToBike  = s => ({bikeId: s.assetId ?? 0, name: s.referenceName, imageUrl: s.imageUrl, rarity: s.rarity ?? 0})
displayAssetToRider = s => ({riderId: s.assetId ?? 0, name: s.referenceName, imageUrl: s.imageUrl})
```
List items also carry **[E]** `isUserBikeSelected` / `isUserRiderSelected`. A synthetic `{riderId:0, name:'Default Rider'}` and bikes named `…default…` exist for users with no NFTs.

### Wallet / Balance / Transaction
**[E]** Wallet: `{id, typeId, …}` — `getInternalWallet = s => s.wallets.wallets.find(w => w.typeId === WalletType.Internal)`.

**[E]** Balance: `{currencyTypeId, balance}` (see `cleanWalletBalances`).

**[E]** Transaction: `{transactionId, createdOn, transactionType, creditAmount, creditCurrencyTypeId, debitAmount, debitCurrencyTypeId}` — a classic **double-entry ledger row**.

### Payment
**[E]** `POST commerce/payment/intent` request:
```js
{paymentGateway: Platform.OS==='ios' ? PaymentGateway.AppleAppStore : PaymentGateway.GooglePlay,
 items: [{bundleId: <id>, quantity: 1}]}          // or [{mapPackageId: <id>, quantity: 1}]
```
Response: **[E]** `{isSuccess, message, clientSecret, paymentGuid}` (`clientSecret` implies a Stripe path exists for the web/other gateways).

**[E]** `POST commerce/payment/inapp` request:
```js
{paymentGuid, transactionReceipt, transactionId, productId}
```
Response contains **[E]** `paymentStatus` (checked against `Funded` / `Completed`) and `assets[]` (the newly minted/allocated NFTs).

### Referral
**[E]** `GET user/referrals` → `{activeReferrals, totalReferrals, powerEarned, powerPending, powerAwarded, powerAwardPending, details:[{referralUserGuid, isActive, …}]}`

### Campaign
**[E]** `{campaignId, campaignStatus, discounts:[{discountId, …}], …}`; enter body `{entries, products:[productId]}`.

### Enums (all **[E]**, verbatim)

```js
ConnectionType        { AppleHealthKit:1, GoogleFit:2, Strava:4 }
DistanceUnit          { Kilometer:0, Miles:1 }
CurrencyType          { Dollar:1, Power:2, Cyclr:3, Ticket:4, Cardano:5 }
WalletType            { Internal:1, Cardano:2, Polygon:3, Solana:4 }
PaymentGateway        { Test:0, Stripe:1, Coinbase:2, GooglePlay:3, AppleAppStore:4 }
PaymentStatusEnum     { Started:1, Pending:2, Funded:3, Completed:99,
                        Canceled:-1, Rejected:-2, ChargedBack:-3, TimedOut:-4 }
OnboardingStep        { SelectTracker:1, SelectBike:2, SelectRider:3, ClaimRide:4 }
LeaderBoardOrderBy    { PowerEarned:0, Distance:1 }
CampaignStatus        { Complete:1, Active:2, Coming:3 }
CampaignTypeEnum      { LimitedOffers:1, Raffles:2, MerchShop:3, Partners:4,
                        Bikes:5, Equipment:6, Miscellaneous:7 }
CampaignEntranceType  { Unavailable:0, Available:1,
                        RestrictedDueToUserBikes:2, RestrictedDueToUserRiders:3 }
CampaignDiscountType  { Percentage:1 }
ProductProviderType   { Internal:1, Tremendous:2, Giftbit:3, EmailInventory:4,
                        Shopify:5, InternaTicketRaffle:6 }
BundleStatus          { Available:1, Unavailable:2, Coming:3, "Sold Out":4 }
NotificationType      { Marketplace:1, Referral:2 }
LogLevel              { Critical, Debug, Error, Information, Trace, Warning }  // string enum
RideDistanceBuckets   { First:56327, Second:80467.2, Third:112654.1,
                        Fourth:144841, Fifth:193121.3 }   // metres — 35/50/70/90/120 miles
```

`RideDistanceBuckets` **[I]**: these are exact metre values of 35, 50, 70, 90 and 120 miles — a client-side histogram/bucketing of lifetime distance, most likely for the tier or badge display.

---

## 5. Ride ingestion — how a ride actually gets in

This is the most consequential finding for a design spec.

**There is no in-app ride recording.** No `react-native-maps`, no `expo-location`, no background geolocation, no `MapView`. The AndroidManifest declares **no** `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACTIVITY_RECOGNITION` or `BODY_SENSORS` permission — only `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`, `WAKE_LOCK`, `VIBRATE`, storage and a pile of launcher-badge permissions. There is no start/stop/checkpoint call and no live streaming. **[E]**

W3:Ride is a **pull-based aggregator of third-party fitness records**, with three routes in:

**(a) Apple HealthKit — client push.** The only path actually wired up. **[E]**

```js
// HealthService
healthKitPermissions = {permissions:{read:[Permissions.HeartRate, Permissions.Workout], write:[]}}

getAppleWorkouts(cb){ this.initHealthKit(ok => {
  if(!ok) throw new Error('Apple permissions are not granted');
  const opts = {startDate: HealthService.getStartDate().toISO(),  // utcNow − 10 days
                type:'Workout',
                endDate: HealthService.getEndDate().toISO(),      // utcNow
                unit:'mile'};
  AppleHealthKit.getSamples(opts, cb); })}
```

and the caller in the tab navigator **[E]**:

```js
if (Platform.OS==='ios' && connections.some(c=>c.connectionType===ConnectionType.AppleHealthKit))
  health.getAppleWorkouts(async (err, samples) => {
    if (err) { console.error("Couldn't get Apple workout sessions:", err); return }
    if (samples.length>0) await dispatch(importRidesApple(samples));
    await refreshRides(); })
```

So the client POSTs the **raw HealthKit `Workout` sample array** to `ride/import/apple`, un-transformed, on every app foreground (`AppState` `change` → `active`). It is a **10-day rolling re-sync**, not an incremental cursor — the server must dedupe. Response is **[E]** `{imported, received}`.

**(b) Google Fit and (c) Strava — server-side pull.** **[E]** The thunks `importRidesGoogle` / `importRidesStrava` exist and target `ride/import/google` / `ride/import/strava`, but **neither is dispatched anywhere in the bundle** (each identifier occurs exactly 3 times: the export hoist, the thunk-name template literal, and the export assignment — no call site). Instead, connecting either provider runs an OAuth flow whose authorize URL the **server** hands out:

```js
getConnectUrl(t){ return api.get(`user/connection/${t}/url`).data }

async connectToService(t){
  const url = await this.getConnectUrl(t);
  const p   = this.decodeUrlParams(url);   // client_id, response_type, redirect_uri, approval_prompt, state, login_hint, scope
  WebBrowser.maybeCompleteAuthSession();
  const res = await WebBrowser.openAuthSessionAsync(url, p.redirectUri ?? '');
  …
  if (t===ConnectionType.Strava)
    Alert.alert('Connected to Strava!','Strava allows rides to be private. In order to claim rewards, please ensure all tracked rides are set to public.'); }
```

**[I]** The redirect lands back on the W3:Ride backend, which stores the provider refresh token and crawls activities server-side. The Strava copy ("please ensure all tracked rides are set to **public**") is strong evidence the backend reads Strava via a public-scope crawl rather than the granted private scope. `ride/import/{google,strava}` are therefore either dead client code or an admin/legacy path.

### Server-side validation hints **[E]**
- Rides carry `isInvalid`. The UI shows: *"This ride has been flagged as invalid. Please contact support@w3ride.io if you feel this is in error."* — **anti-cheat is a server-side flag**, and the Claim control is disabled when `ride.isInvalid`.
- Rides carry `isPending` and a `pending` / `expired` query dimension: a ride is claimable only inside a window (new-rides window 10 days; expired window a further 7 days back).
- `ride/include` returns the authoritative array; the client explicitly assumes failure ("`t.length>0 ? t : …isIncluded:false`") — the server can silently refuse an include.
- Quota: `GET ride/include` → `{ridesToInclude, ridesToRecycle, nextRecycleOn}`, plus `ridesLeftCount` on the user summary. **[I]** A weekly cap on how many rides can be monetised, with a cooldown on "recycling".

### Telemetry fields actually transmitted
Only what HealthKit's `Workout` sample carries (start, end, distance in miles, calories, source) — the app requests `HeartRate` read permission but never queries HR samples **[E]**. The Ride DTO the server returns is `distance / duration / timeStamp / displayAverageSpeed`. **No lat/lng, no per-point stream, no batching.**

---

## 6. Auth model

**Auth0 Universal Login via `react-native-auth0`.** **[E]**

```js
this.scope    = 'openid profile email offline_access';
this.audience = Constants.manifest.extra.auth0Audience;         // https://w3ride.io/api
this.auth0    = new Auth0({domain: extra.auth0Domain, clientId: extra.auth0ClientId});

login()          { const creds = await this.auth0.webAuth.authorize({scope:this.scope, audience:this.audience});
                   await this.auth0.credentialsManager.saveCredentials(creds); return creds }
logout()         { await this.auth0.credentialsManager.clearCredentials();
                   await this.auth0.webAuth.clearSession({}) }
refreshTokens(t) { await this.auth0.auth.refreshToken({refreshToken:t, scope:this.scope}) }
checkCredentials(){ return (await this.auth0.credentialsManager.hasValidCredentials())
                    ? await this.auth0.credentialsManager.getCredentials() : undefined }
```

Token handling in the Redux `user` slice **[E]**:

```js
authenticate(state, action){
  state.token = action.payload.jwtToken;
  AsyncStorage.setItem('w3ride:idToken', action.payload.jwtToken);
  if (action.payload.accessToken){
    state.accessToken = action.payload.accessToken;
    AsyncStorage.setItem('w3ride:accessToken', action.payload.accessToken);
    api.defaults.headers.common.Authorization = `Bearer ${action.payload.accessToken}`; }}
logout(state){ state.hasLoggedOut = true;
  AsyncStorage.removeItem('w3ride:idToken'); AsyncStorage.removeItem('w3ride:accessToken') }
```

- Bearer = the Auth0 **access token** (JWT, RS256, audience `https://w3ride.io/api`); the **id token** is stored too but only for identity display.
- `offline_access` is requested → refresh tokens exist, and Auth0's native `CredentialsManager` performs the refresh transparently. **There is no app-level 401 → refresh → retry interceptor**; on cold start the app calls `checkCredentials()` (which refreshes if needed) and re-sets the header.
- Both tokens are persisted in plain **AsyncStorage** under `w3ride:idToken` / `w3ride:accessToken` — in addition to the Auth0 credentials manager's own (keystore-backed) copy. **[I]** This is a weakness worth noting in a design spec: an unencrypted mirror of a live bearer token.
- Social login is delegated entirely to Auth0 (a Google OAuth client id is present in `extra`, and `com.google.android.gms.auth.api.signin.*` activities are in the manifest, i.e. Google is an Auth0 connection).
- **No wallet-signature / SIWE authentication anywhere.**
- Email verification is enforced server-side: on `getUser` rejection the app says *"please make sure your email has been verified"* **[E]**.

Storage keys seen **[E]**: `w3ride:idToken`, `w3ride:accessToken`, `w3ride:hasSeenIntro`, `w3ride:hasSeenSync`, `w3ride:hasSeenArrow`, `w3ride:bikeRack`, `w3ride:isGoogleFitAuthorized`, `w3ride:lastSawCampaignWinners`.

---

## 7. Blockchain integration

**There is no web3 client in this app at all.** **[E]** Greps for `walletconnect`, `WalletConnect`, `ethers`, `web3auth`, `magic-sdk`, `metamask`, `chainId`, `contractAddress`, `abi`, and for any `0x` address literal of 38–42 hex chars, return **zero** matches.

What is present:

- **[E]** `WalletType { Internal:1, Cardano:2, Polygon:3, Solana:4 }` — the backend models multi-chain wallets; the app only ever *reads* them via `GET wallet`.
- **[E]** `CurrencyType { Dollar:1, Power:2, Cyclr:3, Ticket:4, Cardano:5 }` — `$POWER` (earned, off-chain) and `$CYCLR` (the token), plus raffle `Ticket` and fiat.
- **[E]** `getInternalWallet` selects `typeId === WalletType.Internal` — the app's whole balance/earning UI reads the **internal custodial wallet**.
- **[E]** Transactions are `{creditAmount, creditCurrencyTypeId, debitAmount, debitCurrencyTypeId}` double-entry rows from `GET transaction` — a **server ledger**, not chain events. No tx hashes, no block explorer links, no confirmations UI.
- **[E]** `POST transaction/power/convert` with a server-supplied rate from `GET settings/convertpowrtocyclr` → `{label, exchangeRate}`. Conversion is a **backend ledger operation**.
- **[E]** Wallet *linking* is explicitly pushed off-app: *"Go to our website app.w3ride.io on a desktop browser, and link your W3:Ride account to your NFT wallets."*
- **[E]** NFT bikes/riders are surfaced as plain `{assetId, referenceName, imageUrl, rarity}` records from the W3:Ride API; artwork is fetched from an Infura IPFS gateway (`w3ride-nexus.infura-ipfs.io`) but only as hard-coded promo images — the rest come as `imageUrl` from the API.
- **[E]** `PaymentGateway.Coinbase:2` exists as an enum value but the app only ever sends `AppleAppStore` / `GooglePlay`.

**Conclusion:** rewards are **custodial ledger entries**, settled entirely off-chain by `service.w3ride.io`. The chains (Cardano / Polygon / Solana) matter only for *ownership of the NFT bikes and riders*, which are read-only in-app and linked via the web app. **[I]** Cardano's appearance in *both* `WalletType` and `CurrencyType` suggests Cardano is the primary chain (consistent with the `cyclernft.com` whitepaper link and the "Cycler NFT" heritage).

---

## 8. Third-party stack

| Concern | Component | Evidence |
|---|---|---|
| Runtime | Expo SDK 49 / React Native, EAS OTA updates via `u.expo.dev` | **[E]** app.config, manifest `expo.modules.updates.*` |
| Auth | Auth0 (`react-native-auth0`), `com.auth0.react.{AuthenticationActivity,RedirectActivity}` | **[E]** |
| Push | Expo Notifications on top of **Firebase Cloud Messaging** (`ExpoFirebaseMessagingService`, `FirebaseMessagingService`, `com.google.android.c2dm.intent.RECEIVE`); token registered at `POST notification/expo/token` | **[E]** |
| Firebase | `@react-native-firebase/app` plugin, `google-services.json`, `ReactNativeFirebaseAppInitProvider`. **Analytics/Crashlytics/Performance modules are NOT present** | **[E]** |
| Payments | `react-native-iap` (`RNIapModule`), Google Play Billing (`com.android.vending.BILLING`, `ProxyBillingActivity`), Apple StoreKit (`buy.itunes.apple.com`, `sandbox.itunes.apple.com`) | **[E]** |
| Health data | Apple HealthKit (`react-native-health`), Google Fit (`react-native-google-fit`, `com.google.gms.fitness.sdk.version`, `com.google.android.apps.fitness` query), Strava OAuth | **[E]** |
| Google Fit scopes | `FITNESS_ACTIVITY_READ`, `FITNESS_HEART_RATE_READ`, `FITNESS_LOCATION_READ` (app's own `googleFitOptions`); the vendored library's default is `FITNESS_ACTIVITY_READ, FITNESS_BODY_WRITE, FITNESS_LOCATION_READ` | **[E]** |
| Analytics / crash | **None.** No Sentry, Bugsnag, Amplitude, Mixpanel, Segment, Firebase Analytics, Crashlytics, AppsFlyer, Branch, OneSignal, PostHog, Datadog. Errors go to the app's own `POST log` via the axios response interceptor | **[E]** |
| Support | Zendesk help centre at `support.w3ride.io`, plus `support@w3ride.io` | **[E]** |
| UI | Redux Toolkit, React Navigation, `@shopify/flash-list`, `@gorhom/bottom-sheet`, `@shopify/react-native-skia`, Reanimated, luxon | **[E]** |

---

## 9. How the reward loop works (synthesis)

1. User authenticates through Auth0; the app pins the access token onto the axios instance. **[E]**
2. Onboarding is a 4-step server-tracked funnel: `SelectTracker → SelectBike → SelectRider → ClaimRide` (`POST activity/onboarding/step`). **[E]**
3. User connects Apple Health (on-device) or Google Fit / Strava (server-side OAuth via `user/connection/{type}/url`). **[E]**
4. Rides land server-side — pushed as raw HealthKit samples on iOS, crawled by the backend for Google/Strava. Each ride gets `powerEarned`, `isPending`, `isInvalid`. **[E]**
5. The user has a *capped* number of rides they may "include" per period (`ridesLeftCount`, `ridesToInclude`); including a ride (`POST ride/include`) credits `$POWER` to the **internal** wallet. Rides not included in time go `expired`; expired rides can be "recycled" for a `recyclePercentage` of their value, gated by `nextRecycleOn`. **[E]**
6. Equipped Bike/Rider NFTs (`rarity`) modulate earnings **[I]** — the app selects them and shows rarity but the multiplier maths is entirely server-side; no formula exists in the bundle.
7. `$POWER` converts to `$CYCLR` at a server-published rate (`settings/convertpowrtocyclr`, `POST transaction/power/convert`), recorded as a double-entry ledger row. **[E]**
8. `$POWER`/`$CYCLR`/`Ticket` are spent in the campaign/marketplace layer (raffles, merch via Shopify/Tremendous/Giftbit providers, map packages), and real money enters through IAP bundles (`commerce/payment/intent` → store purchase → `commerce/payment/inapp` receipt validation → `assets[]` granted). **[E]**
9. Events → maps → routes form a virtual-challenge layer with its own enter/claim calls and purchasable "map packages". **[E]**

---

## 10. Unknowns / not found in bundle

- **Response body of `GET wallet`** beyond `{id, typeId}` — no on-chain address field is read by the client, so whether the DTO carries one is unknown.
- **Earning formula** — how `powerEarned` is computed from distance/duration, and how bike/rider rarity or tier modifies it. Entirely server-side; no coefficients in the bundle.
- **Anti-cheat rules** — only the `isInvalid` flag is visible. No client-side speed/plausibility checks exist.
- **`ride/import/{google,strava}` request bodies** — the thunks pass a caller-supplied argument, and there is no caller, so the shape is unknown.
- **Campaign / bundle / product / notification DTOs** — only the identifier fields quoted above are confirmed (`campaignId`, `campaignStatus`, `discountId`, `bundleId`, `inAppId`, `id`, `seenOn`). Full field lists not enumerated.
- **`GET user/current/challenge` and `community/challenges` response shapes** — only `communityChallengeId` and the fact that tier challenges are a flat array are confirmed.
- **Staging / non-prod hosts** — none in this build.
- **Contract addresses, chain ids, token contract, mint flow** — absent. Not in this app.
- **Any websocket / realtime channel** — absent.
- **Rate limits, API versioning** — the base path is `/api/` with **no version segment**; no version header set on the axios instance.

## 11. Security note

An Auth0 client id, a Google OAuth client id, a Strava client id and an EAS project id are present as configuration constants in `app.config`. These are public client identifiers rather than secrets; their values are deliberately not reproduced in this document. A `google-services.json` is referenced by the build config. No private keys, client secrets, or API secrets were observed embedded in the JS bundle.
