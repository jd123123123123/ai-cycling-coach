# W3:Ride — Economy & Progression Model (reverse-engineered from the Android bundle)

**Artifact:** `/Users/jannisdeters/Downloads/W3%3ARide_0/resources/assets/index.android.bundle`
(Expo/React Native, minified, ~13.6 MB). App version **0.14.6**, Expo SDK 49.
**API base:** `https://service.w3ride.io/api/` (from `app.config`).

**Source-code paths leaked in Reanimated worklet metadata** confirm the real project layout, e.g.
`/home/expo/workingdir/build/W3Ride.MobileApp/screens/Dashboard/ConfirmRidesScreen.tsx`,
`.../components/UI/ButtonSwipable.tsx`.

> **Reading this doc:** every section is split into **(a) HARD EVIDENCE** — a literal constant or
> copy string quoted from the bundle — and **(b) INFERENCE** — my reading of it. A separate
> "Unknowns / not found" section lists what is genuinely absent.

---

## 0. The single most important structural finding

**W3:Ride is a thin client over a server-authoritative economy.** There is *no* reward formula,
tier table, XP curve, durability model, or exchange rate embedded in the JS bundle. Every economic
number the app shows is either:

1. fetched from the API (`powerEarned`, `recyclePercentage`, `exchangeRate`, `entranceAmount`,
   `costAmount`, `ridesLeftCount`, `tierName`, `badgeName`, `rarity`), or
2. a **display constant** (bucket boundaries, meter maxima), or
3. **prose in the UI copy** that describes rules the server enforces.

The prose (category 3) is the highest-value find and is quoted verbatim below. It is the only place
the actual reward *shape* is spelled out.

The app is also not a GPS tracker. It **imports** finished rides from Apple HealthKit, Google Fit or
Strava and then lets you *claim* them. That single fact drives the whole economy design.

---

## 1. Currencies

### 1.1 The currency enum — HARD EVIDENCE

```js
(function(o){return o[o.Dollar=1]="Dollar",o[o.Power=2]="Power",o[o.Cyclr=3]="Cyclr",
 o[o.Ticket=4]="Ticket",o[o.Cardano=5]="Cardano",o})({});e.CurrencyType=t
```

Five currency types: **Dollar (1), Power (2), Cyclr (3), Ticket (4), Cardano (5)**.

Wallet types — HARD EVIDENCE:
```js
n[n.Internal=1]="Internal",n[n.Cardano=2]="Cardano",n[n.Polygon=3]="Polygon",n[n.Solana=4]="Solana"
```

### 1.2 What each currency is — HARD EVIDENCE (in-app explainer, `HowRewardsWork` component)

```js
u=[{icon:'power',iconColor:...purple500,title:'$Power',
    text:'This currency can only be earned by riding and completing challenges. You cannot buy or trade $Power.'},
   {icon:'cyclr',iconColor:...green600,title:'$Cyclr',
    text:'Convert your $Power into $Cyclr to purchase and get discounts on digital and physical items in the upcoming W3:Ride Store. You can trade and buy $Cyclr.'}]
```

Also:
> `"Convert your $Power to $Cyclr, and spend them in the marketplace to get exclusive offers from our partners."`

> `"Convert $Power to $Cyclr for unlocking enhanced rewards. This action can not be reversed and is permanent."`

**INFERENCE:** classic dual-token split. **Power = soft, uncapped-supply, non-tradable earn token**
(the "sweat" currency). **Cyclr = hard, tradable, spendable token** (the "gem"). The one-way,
irreversible Power→Cyclr valve is the entire sink for Power.

### 1.3 Decimals & formatting — HARD EVIDENCE

```js
var l=function(t){return Math.floor(t)};
e.cleanPowerBalance=l;
e.cleanWalletBalances=function(t){ ... t.currencyTypeId===c.CurrencyType.Power ? {...t,balance:l(n.balance)} : t ...}
```

```js
e.formatBalance=function(t){var n=arguments.length>1&&void 0!==arguments[1]?arguments[1]:1e4;
  if(Math.abs(t)>=n){var c=-3,o='k'; Math.abs(t)>=1e6&&(c=-6,o='m'); ... }
  return t.toLocaleString(void 0,{maximumFractionDigits:2})};
```

- **Power is floored to integers everywhere it is displayed** (balances, ride cards, transactions).
- **Cyclr keeps up to 2 decimal places** (it is never passed through `cleanPowerBalance`).
- Balances ≥ threshold render as `1.4k` / `625.3k` / `1.2m`. Most call sites pass `1e3` as the
  threshold, which is why the marketing screenshot reads "625.3K".

**INFERENCE:** the server almost certainly stores Power as a decimal (why else floor it?), and the
client hides the fraction. This matters for a spec: Power is emitted with sub-unit precision.

### 1.4 Power → Cyclr conversion — HARD EVIDENCE

Settings slice:
```js
s={converPowerToCyclrLabel:void 0,convertPowerToCyclrRate:void 0,loading:!1}
... t.converPowerToCyclrLabel=n.payload.label, t.convertPowerToCyclrRate=n.payload.exchangeRate
...
api.get('settings/convertpowrtocyclr')
```

Conversion modal:
```js
X=function(){return +F*(N||0)}          // F = user-entered Power, N = exchangeRate
...
+F>P.balance ? Alert("You don't have that much power.", `Please enter an amount lower than ${formatBalance(P.balance)}`)
: +F<=0     ? Alert('Please enter a value greater than 0.')
: dispatch(convertPower({amount:+F, exchangeRate:N}))
...
api.post('transaction/power/convert', {amount, exchangeRate})
```

UI labels in the same modal: `"$POWER BALANCE"`, `"Current Ratio"` (renders the server `label`
string), a **`MAX`** button that fills the whole balance, and:
```js
parseInt(F)<=N
  ? <>{"Min amount: "}{N+" "+P.currencyName}</>   // warning branch
  : <>{"You will Receive"}{formatBalance(L)}</>
```

**HARD:** conversion is a linear `cyclr = power * exchangeRate`, rate + human-readable label both
come from `GET settings/convertpowrtocyclr`. The rate is echoed back in the POST body (server
re-validates, or should).
**HARD (and a bug worth noting in a spec):** the client reuses the **exchange rate value as the
minimum-conversion-amount threshold** (`parseInt(F) <= N`). If the rate were e.g. 1000, the minimum
conversion would be 1000 Power; if the rate were 0.001, effectively no minimum.
**INFERENCE:** the rate is a live/floating "ratio" the operator can move — the label field exists
precisely so they can show something like "1000 $Power = 1 $Cyclr" without a client release.
**NOT FOUND:** the actual numeric exchange rate. It is server-side only.

### 1.5 Cyclr → Tickets, Tickets → NFTs — HARD EVIDENCE

Raffle "how to participate" screen:
```js
w=[{icon:faBicycle,  name:'Purchase a bike 10 tickets',  text:'Purchase a bike', greentext:'10 tickets',  button:'BUY A BIKE'},
   {icon:faUserCrown,name:'Purchase a rider 20 tickets', text:'Purchase a rider',greentext:'20 tickets',  button:'BUY A RIDER'},
   {icon:faCoins,    name:'Buy tickets 5000 $Cyclr',     text:'Buy tickets',     greentext:'5000 $Cyclr', button:'BUY TICKETS'}]
```
Steps: `'1. Get Tickets'`, `'2. Browse our exclusive items'`, `'3. Spend tickets on your favorite gifts'`, `'4. Win amazing prizes!'`

**HARD numbers:** bike = **10 tickets**, rider (avatar) = **20 tickets**, tickets bought for
**5000 $Cyclr**.
**NOT FOUND:** how many tickets 5000 Cyclr buys. The copy does not say, and the number is not in the
bundle.
**INFERENCE:** the full sink chain is **Ride → Power → (irreversible) Cyclr → Tickets → bikes /
riders / raffle entries / merch**. Tickets are the raffle/gacha layer.

### 1.6 Real-money on-ramp — HARD EVIDENCE

`PaymentGateway`: `Test=0, Stripe=1, Coinbase=2, GooglePlay=3, AppleAppStore=4`.
`PaymentStatusEnum`: `Started=1, Pending=2, Funded=3, Completed=99, Canceled=-1, Rejected=-2, ChargedBack=-3, TimedOut=-4`.
Endpoints: `commerce/bundles`, `commerce/bundles/inAppIds`, `commerce/bundle/{id}`,
`commerce/payment/intent`, `commerce/payment/{id}/complete|cancel|reject|status`.

Bike shop uses `react-native-iap` with a fiat price:
```js
'GET A BIKE '+(_?_.localizedPrice:'$'+N.price.toLocaleString(...))
Alert.alert('Are you sure?',`Do you really want to buy ${E.name} for ${t}?`, ...)
```

**HARD:** bikes and riders are sold for **real money via IAP** (and Stripe/Coinbase off-app), *and*
obtainable for tickets. **NOT FOUND:** any fiat price constant — prices come from the store/API.

---

## 2. Reward formula: how a ride becomes $Power

This is the richest find. The `RidesDetail` screen ships a "Bonus" explainer bottom-sheet whose copy
spells out the earning model.

### 2.1 The explainer, verbatim — HARD EVIDENCE

```js
// Speed
<Text>{"Speed Bonus"}</Text>
<Text>{"Users receive a unique average speed bonus between"}{' '}
      {usesMetricSystem() ? `${Math.round(convertMilesToKm(5))}-${Math.round(convertMilesToKm(30))} KM/h` : '5-30 Mph'}</Text>
<Text>{"Speed bonuses stop after"}{' '}
      {usesMetricSystem() ? `${Math.round(convertMilesToKm(30))} KM/h` : '30 Mph'}</Text>

// Distance
<Text>{"Distance Bonus"}</Text>
<Text>{"Users receive a unique bonus from"}{' '}
      {usesMetricSystem() ? `${Math.round(convertMilesToKm(1))}-${Math.round(convertMilesToKm(35))} KMs` : '1-35 miles'}{' '}{"traveled."}</Text>
<Text>{"After"}{' '}{...'35 miles'}{", riders receive extra $Power per"}{' '}{usesMetricSystem()?'KM':'mile'}{"."}</Text>
  • {'36-49 miles:'}   {"\xa0+250 $Power"}
  • {'50-70 miles:'}   {"\xa0+500 $Power"}
  • {'71-90 miles:'}   {"\xa0+750 $Power"}
  • {'91-150 miles:'}  {"\xa0+1000 $Power"}
```

And from the onboarding explainer:
> `"You're rewarded for a higher average speed and longer distance rides."`
> `"Make your rides count in W3Ride! Decide yourself when to validate and get rewarded with $Power."`

### 2.2 The distance bucket constants — HARD EVIDENCE

```js
e.RideDistanceBuckets = (function(t){return
  t[t.First=56327]="First",
  t[t.Second=80467.2]="Second",
  t[t.Third=112654.1]="Third",
  t[t.Fourth=144841]="Fourth",
  t[t.Fifth=193121.3]="Fifth", t})({});
```

Values are **metres**. Converted:

| Bucket | metres | miles | km | Flat bonus shown next to it |
|---|---|---|---|---|
| First  | 56 327    | **35.0** | 56.3  | (base band ends here) |
| Second | 80 467.2  | **50.0** | 80.5  | +250 $Power |
| Third  | 112 654.1 | **70.0** | 112.7 | +500 $Power |
| Fourth | 144 841   | **90.0** | 144.8 | +750 $Power |
| Fifth  | 193 121.3 | **120.0**| 193.1 | +1000 $Power |

The pairing of bucket → bonus is explicit in the `RidesDetail` render loop — HARD EVIDENCE:
```js
var i=S.RideDistanceBuckets.First, o=250;
0===s ? (i=First,  Second)            // o stays 250
: 1===s ? (i=Second, Third,  o=500)
: 2===s ? (i=Third,  Fourth, o=750)
:         (i=Fourth, Fifth,  o=1e3);
... <Text style={u()}>{o}</Text>       // faded when t < i
... t>i ? <meterBubbleActive/> : <meterBubble/>
```

**Note the discrepancy:** the copy's last band says "91-150 miles" but `Fifth` = 120.0 miles exactly.
The bullet list is hand-written English; the enum is the machine value. Trust the enum for the
5th boundary, and treat "150" as marketing rounding.

### 2.3 The average-speed ceiling — HARD EVIDENCE

In both `RideCard` and `RidesDetail`:
```js
q = k.displayAverageSpeed ? +k.displayAverageSpeed.split(' ')[0] : 0;
G = usesMetricSystem() ? convertMilesToKm(30) : 30;
...
<Meter max={G} amount={q} color="purple"/>
```
`convertMilesToKm = t => 1.609344*t` ⇒ **48.28 km/h**.

**HARD:** the speed meter is normalised against a **30 mph / 48.28 km/h** ceiling — the same number
the copy gives as the point where "speed bonuses stop".
**HARD:** the speed *floor* in the copy is **5 mph / 8 km/h**.

### 2.4 The bike multiplier — HARD EVIDENCE

```js
"Each bike has its own unique stats that affect how many coins you earn for your ride.
 The lower the earning score the higher earning tier you are!"

"The rarity of your bike spans from 16 to 1.75 (the lower the number, the better),
 and has an impact on the earning formula."
```

The bike's `rarity` field is rendered as a bare value next to a star icon, with no unit:
```js
<Ionicons name="star" size={12}/><Text style={y.bikeRarity}>{h.rarity}</Text>
```

**HARD:** a bike carries a single numeric "rarity"/"earning score" in the closed range
**[1.75, 16]**, **lower is better**.
**INFERENCE:** this reads like a *divisor* in the reward formula, i.e. roughly
`power ≈ f(distance, speed) / rarity`, giving a best-to-worst spread of **16 / 1.75 ≈ 9.14×**.
That is the whole NFT value proposition: a top bike earns ~9× a floor bike on the same ride.
I could not find the formula itself, so the divisor reading is inference, not fact.

### 2.5 The per-ride reward context — HARD EVIDENCE

Every ride object carries `powerContextJson`, a server-produced JSON blob:
```js
E = k.powerContextJson ? JSON.parse(k.powerContextJson) : void 0;
W = E ? O.find(t => t.bikeId === E.BikeId) : void 0;
```

**HARD:** the blob exists, is PascalCase (a .NET backend), and contains at least a `BikeId` — i.e.
the reward was computed against a specific bike at claim time. **The client reads only `BikeId`.**

**INFERENCE:** `powerContextJson` is the server's audit trail of the reward calculation (bike used,
bonuses applied, multipliers). Fetching one real response would expose the whole formula. It is the
single highest-value target for anyone continuing this analysis.

### 2.6 Ride fields the client knows about — HARD EVIDENCE

From render sites and the rides slice:
`rideId, timeStamp, duration, distance` (metres), `displayDistance, distanceUnit,
displayAverageSpeed` (a pre-formatted string like `"12 Km/h"`), `powerEarned, powerContextJson,
isIncluded, isPending, isInvalid, isRecycled, recyclePercentage, dayOfWeek`.

**Not present on the ride model:** elevation, heart rate, calories, cadence, max speed, GPS polyline.
`elevation` appears 47× in the bundle but only inside RN style props (`elevation:` shadows) and
HealthKit constants — never on a W3:Ride ride. **There is no elevation or HR term in this economy.**

### 2.7 What a spec should say about the formula

**HARD, defensible reconstruction:**
```
power(ride) = base(distance ∈ [1, 35] mi)          # continuous, "unique" per user
            × speedBonus(avgSpeed ∈ [5, 30] mph)   # continuous, clamped above 30 mph
            × bikeFactor(rarity ∈ [1.75, 16])      # lower rarity ⇒ more power
            + distanceStepBonus(distance)           # +250 / +500 / +750 / +1000 at 50/70/90/120 mi
            × (1 + referralBonus)                   # +10% while a referral window is open
```
Everything in that block except the exact `base()` and `speedBonus()` curves is directly evidenced.
The word **"unique"** in both bonus sentences ("a *unique* average speed bonus", "a *unique* bonus
from 1-35 miles") is doing real work — **INFERENCE:** there is a per-user or per-ride randomised
component, which is consistent with the Re:cycle scratch-card design (§4).

---

## 3. Ride budget: the "3/6 RIDES LEFT" mechanic

This is the app's stamina system, and it is **user-level, not bike-level.**

### 3.1 HARD EVIDENCE

`GET user/current/summary` → `{ridesCount, ridesLeftCount, balances, lifetimeStats:{powerEarned,
distance, duration, rideCount}, connections, badges}`.

Claim screen render:
```js
U = useAppSelector(s => s.user.ridesCount);
N = useAppSelector(s => s.user.ridesLeftCount);
fe = N - _.length;                                    // remaining minus currently selected
ge = () => fe===1 ? colors.yellow700 : fe<1 ? colors.red500 : colors.green600;
...
<Text style={F.ridesLeftTitle}>{"Rides left"}</Text>
<Text style={[F.ridesLeftNumberText,{color:we}]}>{`${fe}/${U}`}</Text>
...
<Text style={F.nextRideAvailableText}>{"Next ride available"}</Text>
<Text style={F.countdown}>{"None"}</Text>
```
Selection is hard-gated: `fe<=0 || (t.selected=!0, ...)` — you cannot select more rides than you have
budget for.

`GET ride/include` → `rideIncludeInfo` with exactly four fields, used here:
```js
st = function(){
  Z && 0===Z.ridesToInclude && Z.nextIncludeOn ? He(Z.nextIncludeOn) : He(void 0),
  Z && 0===Z.ridesToRecycle && Z.nextRecycleOn ? Xe(Z.nextRecycleOn) : Xe(void 0)};
```
and gated in both actions:
```js
if(Z && 0!==Z.ridesToInclude){ ...includeRides([rideId])... } else Alert('You have no remaining rides to claim')
if(Z && 0!==Z.ridesToRecycle){ ...recycleRides([rideId])... } else Alert('You have no remaining rides to recycle')
```

The cooldown is rendered by `ButtonSwipable`, which disables the swipe entirely while a cooldown date
is set and animates a fill over the **final 24 hours**:
```js
<PanGestureHandler enabled={!N && !P} ...>          // P = cooldownDate
<Text>{P ? 'COOLDOWN' : x}</Text>
onTimeUpdate={e=>{ if(e<=0) return q(S);
                   var t=Duration.fromObject({hours:24}).toMillis();
                   if(e>t) return q(0);
                   q(S - S*(e/t)); }}
```

### 3.2 Reading

**HARD:**
- The economy meters **claims**, not rides. You can ride freely; you get `ridesLeftCount` of
  `ridesCount` *claims* per period.
- **Claiming and Re:cycling draw on two separate budgets** (`ridesToInclude` vs `ridesToRecycle`)
  with two separate cooldown clocks (`nextIncludeOn`, `nextRecycleOn`).
- The cooldown UI is calibrated to a **24-hour** window, so cooldowns are expected to be ≤ ~1 day.
- Colour thresholds: green ≥ 2 left, yellow at exactly 1, red at 0.

**INFERENCE:** the "3/6 RIDE LEFT" on the marketing profile card is `ridesLeftCount/ridesCount`
displayed next to the bike, which makes it *look* like bike durability. It is not — it is the
account's claim allowance. There is **no per-bike durability or repair cost anywhere in the bundle**
(see §7). Whether `ridesCount` scales with bike count, tier, or purchases is server-side and
not derivable.

**NOT FOUND:** the reset period (daily? weekly?), the base allowance, and what raises it.

### 3.3 Ride expiry window — HARD EVIDENCE

```js
o = HealthService.getStartDate();                    // static: DateTime.utc().minus({days:10})
u = {pending:!0, expired:!1, from:o.toISO(), skip:0, take:100, distanceUnit:...};  e.NewRidesRequest=u;
c = {pending:!1, expired:!0, from:o.minus({days:7}).toISO(), to:o.toISO(), ...};  e.ExpiredRidesRequest=c;
```
```js
static getStartDate(){ return DateTime.utc().minus({days:10}) }
static getEndDate(){ return DateTime.utc() }
```
Claim screen list header: `"Past 7 Days"`.

**HARD:** the importer sweeps a **10-day** look-back from HealthKit; claimable ("pending") rides are
those from the last 10 days; "expired" rides are the 7-day window before that (days 10–17).
**INFERENCE:** unclaimed rides expire and are lost — a strong daily-engagement lever. The
`"Past 7 Days"` header suggests the intended user-facing claim window is 7 days.

---

## 4. "Re:cycle" — the gamble mechanic

### 4.1 HARD EVIDENCE

```js
recycleRides = createAsyncThunk(`rides/recycleRides`, async ids => {
  var i = ids.map(n=>({rideId:n, isRecycled:!0}));
  var t = (await api.post('ride/include', i)).data; ... });
```
```js
var n = await F(recycleRides([ne.rideId]));  o = n.payload[0];
Be(o.recyclePercentage ? o.recyclePercentage : 0);
Ee(o.powerEarned ? o.powerEarned : 0);
```
The scratch-card UI (`react-native-scratch`-style component):
```js
scratchElement: <Text>{"Re:cycle"}</Text><Text>{"Scratch to Play"}</Text> + faBolt art
rewardElement:  <Text>{"You Won!"}</Text>
                <Text style={rideCardRecycleRewardBoxTitle}>{100*Ae}{"%"}</Text>
                <PowerIcon/><Text>{cleanPowerBalance(_e).toLocaleString()}</Text>
```
Swipe controls: `actionText:"Re:Cycle" / completeText:"Re:Cycled!"` (yellow, RTL swipe) beside
`actionText:"Claim" / completeText:"Claimed!"` (purple, power icon).

### 4.2 Reading

**HARD:** Re:cycle returns a server-decided `recyclePercentage` (a fraction, since the UI multiplies
by 100) plus the resulting `powerEarned`. It is presented as a **scratch card** — "Scratch to Play",
"You Won!", `X%`.
**INFERENCE:** Re:cycle is the *alternative* disposal for a ride you don't want to spend a claim on:
you gamble for a randomised percentage of that ride's Power. It has its own budget and its own
cooldown, so it is a parallel, cheaper, higher-variance earn track. This is the mechanic that makes
"unique bonus" in §2 plausible as a genuinely stochastic system.
**NOT FOUND:** the percentage distribution, min/max, or whether rarity/tier skews it.

---

## 5. Tiers

### 5.1 The ladder — HARD EVIDENCE

```js
e.getTierIconName = function(t){ switch(t.toLowerCase()){
  case'pro':        return'tier-pro';
  case'expert':     return'tier-expert';
  case'enthusiast': return'tier-enthusiast';
  case'funseeker':  return'tier-funseeker';
  case'rookie':     return'tier-rookie';
  default:          return'tier-tutorial'} }
```

**HARD:** six rungs, matched by **name string, case-insensitively**, with `tier-tutorial` as the
fallback: `tutorial → rookie → funseeker → enthusiast → expert → pro`.
**INFERENCE:** the switch has no `case 'tutorial'` — tutorial is the default, so it is the entry
state, and tier names are free-text on the server. Note the marketing screenshot says "Silver Tier",
which appears **nowhere** in the bundle; either that shot is from a different build, or "Silver" is
a server-side tier name that would simply fall through to the tutorial icon.

### 5.2 Tier mechanics — HARD EVIDENCE

User model: `confirmedTier: {tierId, tierName}` and `eligibleTier?: {tierId, tierName}`.
Endpoints: `GET user/current/challenge` (→ `tierChallenges`), `PUT user/current/tier` (`upgradeUserTier`).

`TierUpgrade` bottom sheet:
```js
q = L.reduce((t,n)=>t+n.costAmount, 0);            // L = challenges for the CURRENT tier
...
useEffect(()=>{ var t = A.filter(t=>t.tierId===D.tierId); z(()=>t.map(t=>({...t}))) }, [A,D]);
useEffect(()=>{ U(V ? ()=>({tierId:V.tierId,tierName:V.tierName})
                    : ()=>({tierId:D.tierId+1,tierName:''}));
                P(getCurrentUserTierChallenges({tierId:D.tierId})) }, []);
...
<Text>{"Upgrade your tier"}</Text>
  <TierCard>{D.tierName}</TierCard> <TierCard>{V.tierName}</TierCard>
  <FlatList data={L} renderItem={({item}) => <TierChallengeCard challenge={item}/>}/>
  <Text>{"Cost:"}</Text><Text>{q.toLocaleString()}</Text>
  <Button onPress={G} color="green" disabled={!0}>{"Upgrade"}</Button>
```

Each challenge card:
```js
<Text>{"Lvl. "}{y.tierId}</Text>  <Text>{y.tierName}</Text>
<Text>{y.challengeName}</Text>
{y.completedDate && <CheckIcon/>}
```

Challenge shape: `{challengeId, challengeName, tierId, tierName, costAmount, completedDate}`.

Onboarding copy:
> `"After our Beta test event, riders can complete challenges to rank up and earn more for every ride."`

### 5.3 Reading

**HARD:** tier-up is **challenge-gated + priced**. You must complete a list of named challenges
attached to your current tier, and pay a **cost equal to the sum of all those challenges'
`costAmount`**. `tierId` is an integer ladder rendered as "Lvl. N". Tiers are advertised as
increasing per-ride earnings.
**HARD:** the Upgrade button is **hardcoded `disabled: true`** in this build — the tier ladder was
shipped but switched off, matching the "After our Beta test event" copy.
**NOT FOUND:** every threshold. There is no client-side table of "N rides / N miles / N Power → tier
X". The challenge list, its names, the `costAmount` values and the currency of that cost all come
from `GET user/current/challenge?tierId=…`. **I could not determine which metric gates each tier or
at what numbers, and there is no number in the bundle to guess from.**

---

## 6. Levels & XP

**NOT FOUND.** There is no XP field, no `level` field on the user or the bike, no level curve, no
"level up" action, and no stat-gain-per-level table anywhere in the bundle.

The only thing labelled "Lvl." is the tier index (`"Lvl. "+challenge.tierId`, §5.2).
The only other "level" is `getRouteLevelIcon(1..4)` / `getRouteLevelColor(1..4)` — HARD EVIDENCE:
```js
e.getRouteLevelIcon = t => { switch(t){ case 1: default: return faRabbitRunning;
                                        case 2: return faFire; case 3: return faRocketLaunch;
                                        case 4: return faGem } };
e.getRouteLevelColor = t => { switch(t){ case 1: return orange500; case 2: return red500;
                                         case 3: return purple700; case 4: return green600;
                                         default: return gray600 } };
```
That is a **route difficulty rating (1–4)** for virtual-map routes, not a progression level.

---

## 7. Bikes (and riders)

### 7.1 What the client actually knows about a bike — HARD EVIDENCE

Bikes slice (`user/current/bike`, `PUT user/current/bike/{id}`):
```js
b = {bikes:[], loading:!1, selectedBike:void 0, totalBikes:0, bikeRack:[]}
... var n = i.payload.items.find(t => t.isUserBikeSelected); t.selectedBike = n ? {...n} : void 0;
```
Fields observed at render sites: `bikeId, name, rarity, images:{rs, rm, rl, l}, imageUrl,
isUserBikeSelected`.

Riders (avatars) mirror this exactly: `ridersSlice`, `user/current/rider`, `PUT user/current/rider/{id}`,
`{riderId?, name, images:{rl}, isUserRiderSelected}`.

### 7.2 Collection & rarity — HARD EVIDENCE

```js
"8088 digital bikes, all unique."
"With a trillion of possibilities and only 8088 bikes selected, our unique process of creation
 ensures that no two bikes are the same in the collection."
"The rarity of your bike spans from 16 to 1.75 (the lower the number, the better), and has an
 impact on the earning formula."
"Each bike has its own unique stats that affect how many coins you earn for your ride.
 The lower the earning score the higher earning tier you are!"
"Thanks to blockchain technology, you have now complete access to your digital assets.
 The proof of ownership gives you the ability to buy, sell or trade them at any given point."
"Just like the bike collection, your are the true owner of your digital avatar."
"The avatars have been designed to mirror the bike collection. If the numbers are the same,
 it's a matching pair."
```

`WalletType` enum lists `Cardano=2`, and `CurrencyType.Cardano=5`. Riders are 20 tickets vs bikes' 10.

**HARD:** fixed collection of **8088** bikes; a matching avatar collection with **paired numbering**;
a single numeric rarity in **[1.75, 16]**, lower = better; NFTs on **Cardano**.
**INFERENCE:** the "matching pair" line implies a **set bonus** for bike+rider with the same number,
but no bonus logic or copy quantifies it in the bundle. Riders costing 2× the tickets of bikes
suggests they are scarcer or cosmetically premium; nothing shows riders affecting earnings.

### 7.3 Bike rack — HARD EVIDENCE

```js
getBikeRack: async () => { var t = await AsyncStorage.getItem('w3ride:bikeRack'); return t?JSON.parse(t):[] }
setBikeRack: async t => { await AsyncStorage.setItem('w3ride:bikeRack', JSON.stringify(t)); return t }
...
if(P.length>4) P=P.slice(0,4); else if(P.length<4) for(...) P.push(void 0);
"Choose up to 4 bikes to display"
```
**HARD:** the "bike rack" is a purely local, **4-slot cosmetic showcase** stored in AsyncStorage. It
is not an equipment or socket system.

### 7.4 What is NOT in the bike model

**NOT FOUND, searched exhaustively:** `durability`, `repair`, `mint`, `breed`, `socket`/`gem` as game
mechanics, `efficiency`, `luck`, `comfort`, `resilience`, `energy`, `stamina`, HP, level, upgrade
cost, quality class, or the words `common`/`uncommon`/`epic`/`legendary` used as rarity tiers.
(`common` hits 73× but only inside CSS/vendor code; `faGem`/`socketId` are FontAwesome and
WebSocket/Auth0 respectively; `repair` appears twice in vendor code.)

The forward-looking copy is explicit that upgrades don't exist yet:
> `"After Beta testing, we'll be releasing a marketplace with gift cards, physical goods and bike upgrades."`
> `"Take a look at our store, the one-stop place to upgrade your bike ranking, your rewards and your style."`

**INFERENCE:** at v0.14.6, a bike is a **static multiplier NFT**. It never wears out, never levels,
never needs repair. The STEPN-style durability/repair loop is absent by design — W3:Ride throttles
earning with the *account-level claim budget* (§3) instead of with item durability. That is a
genuinely different design choice and is the headline difference worth putting in a competitive spec.

---

## 8. Energy / stamina

**NOT FOUND as a game system.** There is no energy pool, no regen rate, no energy-per-ride cost.
`EnergyConsumed` and `BasalEnergyBurned` are Apple HealthKit sample-type constants, nothing more.

**The functional equivalent is the claim budget** (§3): `ridesLeftCount / ridesCount` plus
`ridesToInclude` / `ridesToRecycle` plus `nextIncludeOn` / `nextRecycleOn` cooldowns.

---

## 9. Milestones & badges

### 9.1 Badges — HARD EVIDENCE

```js
var s=(0,createSlice)({name:'badges', initialState:{badges:[]},
        reducers:{setBadges:function(s,t){s.badges=t.payload}}});
```
Badges arrive inside `GET user/current/summary` and are dispatched straight into the store:
```js
var o=(await api.get('user/current/summary')).data; i(setBadges(o.badges)); return o;
```
Render shape:
```js
oe.map(e => ({ id: e.id ?? '', text: e.badgeName ?? '', image: e.awardDate ? EARNED : LOCKED }))
... .filter(t => !!t.awardDate)
```

**HARD:** a badge is `{id, badgeName, awardDate}`. Locked vs earned is decided purely by
`awardDate` being set. **The catalogue and every threshold live on the server.** The marketing
badges ("25 rides streak", "600K Power", "200+ miles") are just `badgeName` strings.

### 9.2 "Milestones" — HARD EVIDENCE

The word `milestone` appears in the bundle only (a) as an Octicons glyph name, and (b) as a prop on
a **virtual-route landmark card**:
```js
e.default = function(t){ var n=t.milestone, o=t.style;
  return <View>{!!n.images && <ImageBackground source={{uri:n.images.rl}}/>}
              <Text style={u.title}>{n.title}</Text></View> }
```
In the Map/Route UI, alongside `'landmarks'`, `'Challenge Goal:'`, `'Goals'`, `'Rewards:'`.

**HARD:** in *this* build "milestone" means a **landmark along a virtual route**, not a profile
progress ring.
**NOT FOUND:** the "Next milestone / 25 rides 50% / 200 miles 73%" rings from the marketing shots.
They are not in this bundle version. The underlying counters certainly exist though —
`lifetimeStats: {powerEarned, distance, duration, rideCount}` from the summary endpoint is exactly
the data those rings would need.
**INFERENCE:** milestone thresholds (25 rides, 200 miles, 600K power) are server-defined badge
thresholds; the rings are a later or A/B'd UI over `lifetimeStats`.

### 9.3 Streaks

**NOT FOUND.** No streak counter, no streak multiplier, no streak-break logic anywhere in the
bundle. "25 rides streak" exists only as a server `badgeName` in marketing.

### 9.4 Leaderboard — HARD EVIDENCE

```js
e.LeaderBoardOrderBy = (function(n){return n[n.PowerEarned=0]="PowerEarned", n[n.Distance=1]="Distance", n})({});
getCurrentLeaderBoard: async n => (await api.get('user/current/leaderboard', {params:{...n}})).data
```
**HARD:** leaderboards rank by **Power earned** or **Distance**, two modes only.

### 9.5 Community challenge — HARD EVIDENCE (partly mocked in this build)

```js
getCommunityChallengeById("id")                       // literal string 'id' — placeholder
<Text>{"Around"}</Text><Text>{"the world "}{"x2."}</Text>
<Text>{"Community challenge"}</Text>
<Text>{"26%"}</Text><Text>{"Two Rounds"}</Text>
<Meter max={100} amount={26}/>
<Text>{"Total Community Progression"}</Text>
<Text>{"5.000"}</Text><Text>{"$Cyclr"}</Text>
"Let’s use the community riding power to go twice the distance around the globe.
 That’s 80.150Km to ride! Are you ready for this challenge?"
<Text>{"Duration:"}</Text><Text>{"4 weeks"}</Text>
[{text:'Claim at least one ride to enrol.'},
 {text:'If the community reaches the target goal in the allotted time, you’ll receive your prize.'}]
"NOT YET ENROLLED" / "ENROLLED"
```
**HARD:** a community challenge shape exists — collective distance goal (**80,150 km ≈ 2× Earth's
circumference**), **4-week** duration, **5,000 $Cyclr** prize pool, enrolment by **claiming ≥1 ride**.
**INFERENCE + caveat:** the progress (26%), the goal text and the prize are hardcoded literals in the
JSX and the fetch passes the literal string `"id"`. This screen is a **stub/mock**, so treat the
5,000 Cyclr and 26% as design intent, not live values. (The enrolled/not-enrolled badge is even
keyed off the unrelated `displayValueAsPercentage` flag — clearly unfinished.)

---

## 10. Referrals

### 10.1 The rules, verbatim — HARD EVIDENCE

Referrer side:
```js
"Recruit new riders and earn a"  <b>"10% bonus"</b>  "on every ride they claim for"  <b>"30 days"</b>  "."
"Recruit new riders and earn a 10% bonus on every ride they claim for 30 days when signing up."
```
Invitee side:
```js
"Have a referral code?"
"Enter a referral code to earn 10% bonus points for every ride you claim, for 30 days."
```
Payout timing:
```js
<Text type="h4">{"How it works:"}</Text>
<Text>{"The total amount of your bonus will be available for you to claim at the end of the 30 days period."}</Text>
```
Share message template:
```js
`@${u} is inviting you to join W3:Ride, the fastest growing cycling community. Connect your tracker
and automatically earn rewards, discounts, and badges just by being active.

Use code ${p} for a 10% bonus on every ride for a month when you sign up. Join now!`
```

### 10.2 Mechanics — HARD EVIDENCE

Endpoints:
```
GET  user/referralCode                          (getReferralCode)
POST user/referralCode/{CODE_UPPERCASED}        (addReferralCode)
POST user/referralCode/verify/{CODE_UPPERCASED} (verifyReferralCode)
GET  (user referral status)                     → referralStatus
POST user/userReferral/{id}/claim/referral      (claimUserReferralForInvitee)
POST user/userReferral/{id}/claim/referrer      (claimUserReferralForReferrer)
```
Codes are normalised: `n.toUpperCase().trim()`.

`referralStatus` shape:
```js
{ activeReferrals, totalReferrals, powerAwardPending, powerAwarded, powerEarned, powerPending,
  details: [{ referralUserGuid, referralUserName, rider:{images:{rl}}, powerAwarded, ... }] }
```
Referral card UI: `"Total Reward"` + `formatBalance(z.powerAwarded)` + power icon, a countdown
(`clock` icon), and a `"Claim now"` / `gift-outline` CTA. Sections: `'Active rewards'`,
`'Completed rewards'`, `'You need to invite a friend first.'`,
`'You have no completed referrals yet. Invite your friends, local bike shop or club and start
earning extra $Cyclr!'`

### 10.3 Reading

**HARD:**
- **Bilateral 10%.** Both referrer and invitee get **+10% on every ride claimed**, for **30 days**.
- The bonus is paid in **$Power** (`powerAwarded`, `powerPending`, `powerAwardPending`), despite one
  stray line of copy saying "$Cyclr".
- The bonus **accrues and is escrowed**, claimable in one lump **at the end of the 30-day period** —
  with separate claim endpoints for each side.
- Codes are case-insensitive and verified before submission.

**NOT FOUND:** any cap on number of referrals, any cap on total bonus Power, any anti-self-referral
rule, or any decay. `activeReferrals` vs `totalReferrals` implies concurrency is tracked, but no
limit constant exists client-side.

---

## 11. Anti-cheat & validation

### 11.1 HARD EVIDENCE

Server-side invalidation, surfaced as a per-ride boolean:
```js
"This ride has been flagged as invalid. Please contact support@w3ride.io if you feel this is in error."
```
An invalid ride is fully inert in the client:
```js
onPress: () => { k.isInvalid || (...) }                  // not selectable
he = function(t){ if(!t.isInvalid){ ... } }              // not claimable
<ButtonSwipable disabled={we || ne?.isInvalid} .../>     // claim + recycle both blocked
{!k.isInvalid && <PowerEarned/>}                          // no power shown
```

Apple manual-entry flag is normalised and forwarded — HARD EVIDENCE:
```js
var i = n.map(n => { var t = {...n};
  null != t.metadata?.HKWasUserEntered && (t.metadata.HKWasUserEntered = 1 == t.metadata.HKWasUserEntered);
  return t });
await api.post('ride/import/apple', i);
```

Strava privacy requirement:
```js
"Strava allows rides to be private. In order to claim rewards, please ensure all tracked rides are set to public."
"In order to claim rewards, please ensure all tracked rides are set to public."
```

Ride provenance is pinned to a connection type:
```js
e.ConnectionType = { AppleHealthKit:1, GoogleFit:2, Strava:4 }
```
(Note `Strava=4`, not 3 — a **bit-flag layout** with 3 reserved, so a ride's source set is probably
a bitmask server-side.)

Import window is clamped: `getStartDate() = DateTime.utc().minus({days:10})`, `getEndDate() = utc()`.

Logging: `api.post('log', …)` with `LogLevel {Critical, Debug, Error, Information, Trace, Warning}`.

### 11.2 Reading

**HARD:** all validation is **server-side**. The client contributes exactly three things: it forwards
`HKWasUserEntered` (so the server can reject hand-typed HealthKit workouts), it clamps the import
window to 10 days, and it hard-blocks any interaction with a ride the server has marked `isInvalid`.

**NOT FOUND in the client:** GPS sanity checks, speed ceilings used as *validation* (the 30 mph
number is a bonus cap, not a rejection rule), minimum ride length/duration, device-motion or
mock-location detection, jailbreak/root detection.

**INFERENCE:** because W3:Ride never records the ride itself, its entire anti-cheat surface is
"do we trust Apple/Google/Strava?" — hence the `HKWasUserEntered` forwarding and the insistence on
public Strava activities. A spec should note this is both the app's biggest simplification (no GPS
stack to build) and its biggest fraud exposure (import a fake Strava activity and the reward is
computed on it).

---

## 12. Sinks: events, maps, campaigns, raffles

### 12.1 HARD EVIDENCE — enums

```js
CampaignTypeEnum:      LimitedOffers=1, Raffles=2, MerchShop=3, Partners=4, Bikes=5, Equipment=6, Miscellaneous=7
CampaignStatus:        Complete=1, Active=2, Coming=3
CampaignEntranceType:  Unavailable=0, Available=1, RestrictedDueToUserBikes=2, RestrictedDueToUserRiders=3
CampaignDiscountType:  Percentage=1
BundleStatus:          Available=1, Unavailable=2, Coming=3, "Sold Out"=4
ProductProviderType:   Internal=1, Tremendous=2, Giftbit=3, EmailInventory=4, Shopify=5, InternaTicketRaffle=6
NotificationType:      Marketplace=1, Referral=2
```
Campaign filtering — HARD EVIDENCE: `d = i.entranceType <= o.CampaignEntranceType.Available`, i.e.
campaigns are only listed if entrance is `Unavailable` or `Available`; **`RestrictedDueToUserBikes` /
`RestrictedDueToUserRiders` campaigns are hidden entirely** unless you hold the right NFTs.

### 12.2 HARD EVIDENCE — spending Power/Cyclr on entry

```js
<Button disabled={O}>{O && "Claimed"}
  {!O && "Buy for  "}
  {!O && W.entranceCurrencyTypeId===CurrencyType.Power && <Icon name="power"/>}
  {!O && W.entranceCurrencyTypeId===CurrencyType.Cyclr && <Icon name="cyclr"/>}
  {!O && (W.entranceAmount ? formatBalance(W.entranceAmount,1e3) : 0)}</Button>
```
Map package card:
```js
<Text>{"Entry Cost"}</Text>
{!!j.entranceAmount && !!j.entranceCurrency && <Text>{j.entranceAmount.toLocaleString()} {j.entranceCurrency}</Text>}
{!j.entranceAmount && !j.entranceCurrency && <Text>{"None"}</Text>}
...
<Text>{"Goals"}</Text>  j.nodes.map(t => <Text>{t.title}</Text>)   // t.order>19 highlights
"Join " + j.name  /  "Please be patient while joining."
```
Virtual-route flow endpoints:
```
GET  event, event/{id}, event/{id}/map      POST event/{id}/enter
GET  map/{id}, map/{id}/route, map/{id}/package   POST map/{id}/enter, map/{id}/claim
GET  route/{id}                              POST route/{id}/enter
```
Copy: `'Pick a map that fits your goals and start earning! From casual commuters to pro-cyclists,
there's something for everyone.'`, `'Select your route'`, `'Event Pricing:'`, `'Challenge Goal:'`,
`'Rewards:'`, `'Scratch to reveal'` / `'You Won!'` (a second scratch card, on map rewards),
`'I already have a code'` / `'If you signed up for the real race, enter your code here to join the
virtual challenge!'`

### 12.3 Reading

**HARD:** virtual events/maps/routes are a **paid content layer** with a per-package entry price
denominated in **Power *or* Cyclr** (`entranceCurrencyTypeId`), staged goals (`nodes` with `order`,
landmark "milestones"), and a **scratch-card reward reveal** on completion. Some campaigns are
gated on **owning specific bikes or riders**.

**INFERENCE:** this is the main Power/Cyclr sink besides conversion — it recycles earned currency
back into engagement, and the NFT-gating gives bikes a second utility beyond the earn multiplier.
Real-world race tie-ins ("if you signed up for the real race, enter your code") suggest a
partnerships/B2B revenue line.

**NOT FOUND:** any entry price constant. All `entranceAmount` values are server data.

---

## 13. Onboarding funnel — HARD EVIDENCE

```js
e.OnboardingStep = { SelectTracker:1, SelectBike:2, SelectRider:3, ClaimRide:4 }
POST activity/onboarding/step
```
Copy: `"Pick your primary ride tracker"`, `"In order to retrieve your rides automatically, we need to
connect to how you record your rides."`, `"Select your very first ride to validate."`,
`"Connect to your favorite tracking app and automatically download the data to start earning.
No need to switch from your favorite fitness tracking apps!"`

**INFERENCE:** four-step funnel ending in a forced first claim (`ClaimRide`), i.e. the aha-moment is
engineered to be "I got paid for a ride I'd already done". A default bike and default rider exist
(the bikes slice filters items whose `name` contains `'default'`), so new users are given a
starter NFT rather than being paywalled.

---

## 14. Consolidated spec sheet (evidence grade marked)

| Parameter | Value | Grade |
|---|---|---|
| Currencies | Dollar, **Power**, **Cyclr**, **Ticket**, Cardano | HARD (enum) |
| Power supply | earn-only, non-purchasable, non-tradable | HARD (copy) |
| Cyclr supply | from Power conversion; tradable & purchasable | HARD (copy) |
| Power display precision | `Math.floor` → integers | HARD |
| Cyclr display precision | 2 dp | HARD |
| Power→Cyclr rate | server `exchangeRate`, linear, irreversible | HARD (mechanism) / NOT FOUND (value) |
| Min conversion | equals the exchange-rate value (client-side check) | HARD |
| Speed bonus band | **5–30 mph / 8–48 km/h** | HARD (copy + `convertMilesToKm(30)`) |
| Speed bonus cap | stops above **30 mph / 48.28 km/h** | HARD |
| Distance bonus band | **1–35 mi / 1.6–56 km** continuous | HARD (copy) |
| Distance step bonuses | **+250 / +500 / +750 / +1000 $Power** | HARD (copy + render loop) |
| Distance step boundaries | **56 327 / 80 467.2 / 112 654.1 / 144 841 / 193 121.3 m** (35/50/70/90/120 mi) | HARD (enum) |
| Bike rarity range | **1.75 – 16**, lower is better | HARD (copy) |
| Bike rarity effect | multiplies/divides the earning formula (~9.1× spread) | HARD (that it does) / INFERENCE (how) |
| Bike collection size | **8088** | HARD |
| Rider collection | mirrors bikes, **paired numbering** | HARD |
| Elevation / HR in formula | **absent** | HARD (negative) |
| Claim budget | `ridesLeftCount / ridesCount` (shown "3/6") | HARD |
| Separate recycle budget | `ridesToRecycle`, own cooldown | HARD |
| Cooldown UI window | **24 h** fill | HARD |
| Claimable ride window | 10-day import look-back; expired bucket = prior 7 days; UI says "Past 7 Days" | HARD |
| Re:cycle payout | server `recyclePercentage` × ride Power, scratch-card reveal | HARD (mechanism) / NOT FOUND (distribution) |
| Tier ladder | tutorial → rookie → funseeker → enthusiast → expert → pro | HARD |
| Tier gate | complete tier challenges + pay Σ`costAmount` | HARD (mechanism) / NOT FOUND (values) |
| Tier upgrade in v0.14.6 | button hardcoded `disabled` | HARD |
| XP / levels | **do not exist** | HARD (negative) |
| Durability / repair / mint / breed / sockets | **do not exist** | HARD (negative) |
| Energy / stamina | **does not exist** (claim budget is the analogue) | HARD (negative) |
| Referral bonus | **+10% per claimed ride, 30 days, both sides**, paid in Power, escrowed and claimed at period end | HARD |
| Referral caps | none found | NOT FOUND |
| Ticket prices | bike **10**, rider **20** | HARD |
| Ticket purchase | **5000 $Cyclr** (quantity unstated) | HARD (price) / NOT FOUND (quantity) |
| Leaderboard modes | PowerEarned, Distance | HARD |
| Community challenge | 80,150 km / 4 weeks / 5,000 $Cyclr | HARD (literals) but screen is a **stub** |
| Anti-cheat | server-only; client forwards `HKWasUserEntered`, clamps 10-day window, blocks `isInvalid` rides | HARD |
| Route difficulty | 1–4 (rabbit / fire / rocket / gem) | HARD |

---

## 15. Unknowns / not found in the bundle

Stated plainly, so nobody mistakes a gap for a zero:

1. **The reward formula's base and speed curves.** Only the input ranges and the flat step bonuses
   are known. `base()` and `speedBonus()` shapes are server-side.
2. **The Power→Cyclr exchange rate** (and its `label` string).
3. **How many tickets 5000 $Cyclr buys.**
4. **Every tier threshold.** No metric, no number. `getCurrentUserTierChallenges` returns them.
5. **Tier `costAmount` values and the currency they are denominated in.**
6. **The badge catalogue and all badge thresholds** (25 rides / 600K power / 200+ miles are
   `badgeName` strings only).
7. **The "Next milestone" progress rings** from marketing — not present in v0.14.6 at all.
8. **The claim-budget reset period and base allowance**, and what increases `ridesCount`.
9. **Exact cooldown durations.** Only that the UI is calibrated to ≤24 h.
10. **The `recyclePercentage` distribution** (min, max, mean, whether rarity/tier skews it).
11. **The full `powerContextJson` schema.** Only `BikeId` is read client-side. *This is the single
    highest-value follow-up: one authenticated `GET /api/ride` response would expose the entire
    reward breakdown.*
12. **Referral caps, anti-abuse rules, or bonus decay.**
13. **Any streak system.** Genuinely absent.
14. **Bike upgrade / marketplace rules.** Copy says "after Beta"; no implementation.
15. **Event/map/route entry prices.** All server-supplied.
16. **Minimum ride distance or duration to be claimable.**
17. **Whether the bike+rider "matching pair" grants a set bonus.** Implied by copy, never implemented
    or quantified client-side.
18. **"Silver Tier"** from the marketing screenshot — that string does not exist in this bundle.

---

## 16. Design takeaways worth carrying into a spec

1. **Import-don't-track.** W3:Ride never runs a GPS session. It reads finished workouts from
   HealthKit/Google Fit/Strava on a 10-day look-back and asks you to *claim* them. Enormous build
   saving; enormous fraud surface.
2. **Throttle claims, not rides.** Instead of STEPN-style shoe durability, the cap is an
   account-level claim allowance with independent cooldowns for the two disposal actions. Riding is
   never discouraged — only *monetising* the ride is rationed.
3. **Two disposals per ride, one safe one random.** Claim (deterministic full Power) vs Re:cycle
   (scratch card, `recyclePercentage`). The scarce claim budget is what makes the gamble attractive.
4. **One NFT stat, not a stat block.** A single `rarity` in [1.75, 16] with ~9× spread, and a
   deliberately legible "lower is better" framing. No efficiency/luck/comfort/resilience quartet.
5. **A hard, irreversible valve between soft and hard currency**, with a floating server-set rate and
   confirmation copy that leans on permanence.
6. **Bilateral 10% referral with escrowed 30-day payout** — the delayed lump-sum claim is the
   retention hook, not the percentage.
7. **Tiers shipped but switched off.** The entire tier UI exists with the upgrade button hardcoded
   disabled — a live-ops lever held in reserve.
8. **Prose as spec.** The only place the earning rules are written down is a "?" bottom-sheet on the
   ride detail screen. If you want to know a competitor's formula, read their help modals before you
   read their code.
