# tests/CASES.md — нормативен инвентар на тестовите сценарии

> Този файл е **единственият източник на истина** за кои сценарии ТРЯБВА да се изпълнят и с какъв очакван резултат. CI брои изпълнените case-ID-та и **пада при липсващ, пропуснат (skip) или дублиран** задължителен case, или при несъответствие на броя. `SPEC.md` реферира числовите бюджети оттук.

## Performance baseline (за всички бюджети)
- Среда: **Chromium, доставен от pinned Playwright**, Apple Silicon (M-клас), headless.
- Метод: медиана от **5 измервания след 1 warmup**; „clean латентност" = `performance.now()` около синхронния clean-пас (hide на всички кандидати + apply unlock); **изключва** последващи observer re-runs.
- Бюджети: clean ≤ **100 ms** при ≤ 2000 възела; ≤ **400 ms** при `large-dom.html` (~10 000 възела); синхронен observer-handler ≤ **16 ms** (p95 от 20 задействания).

## Числови дефиниции (референтни за SPEC)
- `coverage(E)` = площ(пресичане(getBoundingClientRect(E), viewport)) / (innerWidth×innerHeight); праг **0.60**.
- `z-index`: computed `zIndex`; `auto` → третира се като 0; overlay-клон изисква числов `z-index ≥ 1`.
- `textHash` = SHA-1 на trim-нат + collapse-нат whitespace `textContent`, първите **16** hex символа.
- `rectBucket` = `floor(w/50) + "x" + floor(h/50)` (кофи по 50 px).
- Debounce: **trailing**, max-wait **1000 ms** (continuous mutations не могат да гладуват clean-а безкрайно).
- Cap: **20 re-clean изпълнения в плъзгащ 10 s прозорец** → observer спира, badge „⏸"; прозорецът се нулира след 10 s без изпълнение; re-enable при следващ изричен toggle.

---

## Suite 1 — Детекция (unit, happy-dom; чисти функции) — AC-A1 · задължителни: 10
| ID | Вход | Очакван |
|---|---|---|
| D1 | position:fixed елемент | кандидат (клон 1) |
| D2 | position:sticky елемент | кандидат (клон 1) |
| D3 | overlay coverage 0.60, z-index 10, стекинг | кандидат (клон 2) |
| D4 | overlay coverage 0.59, z-index 10 | НЕ-кандидат (под праг) |
| D5 | overlay coverage 0.80, z-index:auto, position:static | НЕ-кандидат (клон 2 иска z≥1) |
| D6 | html елемент (overflow hidden) | НЕ-кандидат (изключен) |
| D7 | body елемент (position:fixed) | НЕ-кандидат (изключен) |
| D8 | вложени кандидати A⊃B | пази A (най-външен), не дублира |
| D9 | нулева площ (w=0) | НЕ-кандидат |
| D10 | display:none | НЕ-кандидат |

## Suite 2 — Mutation ledger (unit) — AC-A2 · задължителни: 7
| ID | Сценарий | Очакван |
|---|---|---|
| L1 | clean → undo, непроменена страница | extension-owned промени върнати идентично |
| L2 | повторен clean без undo | ledger непроменен (idempotent) |
| L3 | undo след като страницата е изтрила възел | възелът НЕ се реинжектира |
| L4 | page презаписва owned inline свойство (same-property re-lock) | relinquish САМО тази (възел,свойство) двойка; page печели |
| L5 | детерминистична собственост (не „page не може да го има") | (а) pre-existing lookalike атрибут/стил на page остава недокоснат; (б) owned стилове се махат по запазена JS референция; (в) форсиран точен token-collision → следва документираната collision-restore политика |
| L6 | предходна inline стойност на пипнато свойство | записана и върната точно (стойност+priority) |
| L7 | partial-root conflict: page сменя edната owned ос, другата недокосната | недокоснатата owned ос се реставрира; relinquish-ната — не |

## Suite 3 — Unlock (Chromium E2E) — AC-A3 · задължителни: 8
| ID | Сценарий | Очакван |
|---|---|---|
| U1 | `body{overflow:hidden}` lock | след clean реален mouse-wheel скрол работи |
| U2a | negative-top fixed (`top:-500`), БЕЗ userScroll, undo | lock възстановен → наблюдаемо визуално „на 500" (±2px) |
| U2b | negative-top fixed, потребителят скролва, undo | lock възстановен → геометрията определя позицията „на 500" (±2px), независимо от userScroll |
| U3 | клас-lock (`.no-scroll{overflow:hidden}`) | override слой отключва; класът НЕ се трие |
| U4 | inline `overflow:hidden!important` на body | inline setProperty override на root отключва |
| U5 | **чист корен без lock-сигнатура** | unlock слой не пипа корена; нищо не се мени (negative) |
| U6a | ordinary overflow lock, БЕЗ userScroll, undo | наблюдаемо `scrollY ≈ scrollY@clean` (±2px) |
| U6b | ordinary overflow lock, потребителят скролва, undo | наблюдаемо `scrollY ≈ текущата позиция` (±2px), не пренасочен |

## Suite 4 — Clean/Undo + hide precedence + focus (Chromium E2E, production билд) — AC-A4 · задължителни: 10 fixtures + 3 precedence + F16 + KF1 = 15
Поддържани fixtures: F1 sticky-header, F2 cookie-bar, F3 newsletter-modal, F5 chat-bubble, F6 social-rail, F7 scrolljack-overlay, F8 body-negative-top, F9 node-replace, F10 open-shadow, F15 good-sticky. За всяка: clean скрива кандидатите, реален скрол работи, `elementFromPoint` връща видимо съдържание (не скрит блокер), клик стига до подлежащия таргет, Undo връща extension-owned.
| ID | Сценарий | Очакван |
|---|---|---|
| P1 | кандидат с inline `display:block!important` | hide fallback = inline `setProperty('display','none','important')`; реално невидим |
| P2 | по-висока специфичност important page-правило | същият inline-important fallback печели |
| P3 | `@layer`-слоеста important декларация | inline-important fallback печели |
| F16 | clean-page (без кандидати/lock) — **цялата страница**, не само корена | нищо не се променя видимо (пълен diff на видимите стилове празен) |
| KF1 | keyboard focus (Tab) след clean | фокусът НЕ попада в скрит елемент; подлежащото съдържание е фокусируемо |

## Suite 5 — Динамика (Chromium E2E) — AC-A6 · задължителни: 9
| ID | Сценарий | Очакван |
|---|---|---|
| DY1 | модал вмъкнат 1.5 s след load (F4) | observer го скрива в рамките на debounce (≤1000ms max-wait) |
| DY2 | боклукът заменен с нов възел (F9) | re-hide; ledger не се чупи |
| DY3a | страницата премахва нашия инжектиран `<style>` | observer (removedNodes) re-asserts го |
| DY3b | страницата премахва нашия session-маркер (без да слага свой) | observer repair-ва (re-apply) |
| DY3c | страницата презаписва owned inline свойство | relinquish на тази двойка (page печели, не re-assert) |
| DY3d | страницата **заменя** нашия session-маркер със своя стойност (marker replacement) — **в document И в open shadow root** | relinquish: НЯМА repair и Undo НЕ презаписва page-стойността на маркера |
| DY4 | self-mutation (нашите промени) | observer НЕ прави цикъл |
| DY5 | непрекъснати мутации над cap | спира след 20/10s, badge „⏸"; undo спира observer |
| DY6 | кандидат вмъкнат между scan#1 (@document_start) и @DOMContentLoaded | покрит (observer активен от startup contract стъпка 3 + reconciliation scan) |

## Suite 6 — Съвместимост (Chromium E2E) — AC-A7 · задължителни: 6
| ID | Fixture | Очакван (деклариран) |
|---|---|---|
| C1 | open-shadow (F10) | PASS: per-root `<style>` скрива |
| C2 | closed-shadow (F11) | LIMITATION: вътрешното остава; без срив |
| C3 | iframe-overlay (F12) | iframe ЕЛЕМЕНТ скрит; вътрешното НЕ се чисти |
| C4 | native-dialog `showModal()`+`::backdrop` (F14) | LIMITATION: тества се **отделно** визуалното скриване (може да стане чрез маркер) И фоновата интеракция (modal inertness може да остане); НЕ се изисква dialog-ът да е видим; без срив |
| C5 | late `attachShadow` на съществуващ непроменен host | LIMITATION: не се открива (иска page-world hook); документирано |
| C6 | nested-scroll контейнер (F13) | LIMITATION: само document-root locks се отключват; вложеният не (отложено) |

## Suite 7 — Persist/picker/entry/worker (E2E) — AC-A8 · задължителни: 12
| ID | Сценарий | Очакван |
|---|---|---|
| S1 | autoClean=on → reload | боклукът авто-скрит след load |
| S2 | picker replay: точно 1 match + fingerprint match | скрива |
| S3 | picker replay: reused-id, различен текст (textHash ≠) | **skip** (не скрива грешен) |
| S4a | picker replay: 0 съвпадения | skip |
| S4b | picker replay: ≥2 съвпадения | skip |
| S5 | **handler рутиране** (съобщението, което и иконата, и shortcut-ът пращат) | изпълнява същата clean/undo операция |
| S6 | `commands` регистрация в манифеста + неприсвоен shortcut | без срив; Options дава инструкция |
| S7 | реален SW terminate+wake (CDP) | badge реконструиран чрез `getState` към content script |
| S8 | две табчета, същ origin | независими live-state |
| S9a | http(s) таб отворен ПРЕДИ инсталация (неустановена причина) | **shared fallback** „Нямам достъп… провери достъпа и презареди"; toggle no-op; без нови права (НЕ фалшиво-специфично съобщение) |
| S9b | withheld site access (неустановена причина) | същият **shared fallback**; без нови права |
| S10 | зареди eligible страници → terminate SW (CDP) → отвори Options БЕЗ reload на страниците → chooser | chooser пак работи (reconstruction-on-demand: enumerate+ping), изброява заварените eligible top-документи |
> Забележка (AC-A8/§harness): **реалният клик по toolbar иконата и реалното OS-ниво на shortcut-а НЕ са автоматизируеми с Playwright** → те отиват в ръчния gate (AC-B). Автоматично се доказва handler-ът (S5) + регистрацията (S6) + `commands.onCommand`/`action.onClicked` слушатели съществуват; НЕ се подменя реалният вход с „еквивалентен helper" скрито — тестът е честно етикетиран като routing/handler.

## Suite 8 — Picker операция (E2E) — AC-A8 допълнение · задължителни: 10
| ID | Сценарий | Очакван |
|---|---|---|
| PK1 | reordered siblings | fingerprint пази идентичност или skip |
| PK2 | reused ID на несвързан елемент | skip (textHash/tag проверка) |
| PK3 | празен текст елемент | идентичност по rectBucket+tag+DOM depth |
| PK4 | Escape по време на picking | изход без избор; всички listeners/highlights махнати |
| PK5 | избор на `<a>`/`<button>` | default action подтиснат (preventDefault+stop, capture); скрит през ledger |
| PK6 | Options „Pick element" с Options като активен таб (вкл. multi-window) | chooser на eligible http(s) табове; избраният се фокусира; НЕ таргетира Options |
| PK7a | stale target: затворен таб / `chrome://` restricted | провал с нотис; без срив |
| PK7b | избраният таб е **навигирал** към друг eligible http(s) документ преди старт | ре-валидация (пак ping); picker стартира на текущия документ или провал с нотис, не на грешен |
| PK8 | nested open-shadow persist + replay през `hostChain` | скрива при точно 1 стабилен match на всяка host стъпка |
| PK9 | ambiguous/нестабилен host в `hostChain` | skip при replay; при избор → session-only (не персистира) |

## Suite 9 — Performance — AC-A9 · задължителни: 3
| ID | Сценарий | Очакван |
|---|---|---|
| PF1 | large-dom (F17, ~10k възела) clean | ≤ 400 ms (медиана/5) |
| PF2 | observer handler под натоварване | ≤ 16 ms p95 от 20 задействания |
| PF3 | малка страница (≤ 2000 възела) clean | ≤ 100 ms (медиана/5) |

## Suite 10 — Privacy zero-network — AC-A5 · задължителни: 4 (3 positive controls)
| ID | Сценарий | Очакван |
|---|---|---|
| N1 | нормален поток (startup/clean/picker/persist/undo) | 0 неочаквани изходящи от extension контекстите |
| N2 | positive control в **service worker** | инжектираната заявка Е хваната |
| N3 | positive control в **Options page** | хваната |
| N4 | positive control в **content script** | хваната |
> Мониторът е закачен ПРЕДИ зареждане на extension-а; наблюдателни прозорци покриват и трите контекста; позволени са само fixture/package ресурси.

## Suite 11 — Release-check самотест — AC-B release-check · задължителни: 15
| ID | Вход в `docs/site-matrix.json` | Очакван exit |
|---|---|---|
| R1 | валиден пълен (10 различни реда + ≥3 различни persistence + ≥2 различни picker + chromeUiInputs true, всички evidence съществуват) | 0 |
| R2 | ред с `functional:"PENDING"` | ≠0 |
| R3 | placeholder URL (празно / „example" / „конкретна" / `<`) | ≠0 |
| R4 | evidence път, който не съществува на диска | ≠0 |
| R5a | `survivesReload:false` | ≠0 |
| R5b | `hidesAndRemembers:false` | ≠0 |
| R5c | `deleteResetWorks:false` | ≠0 |
| R6 | дублирани URL/сайтове, които „надуват" броя | ≠0 |
| R7a | недостатъчен matrix брой (9 < 10) | ≠0 |
| R7b | недостатъчен persistence брой (2 < 3) | ≠0 |
| R7c | недостатъчен picker брой (1 < 2) | ≠0 |
| R8a1 | **липсваща** `chromeUiInputs` (AC-B4) секция (другите полета валидни) | ≠0 |
| R8a2 | **непълна** `chromeUiInputs` секция (липсва поле; другите валидни) | ≠0 |
| R8b1 | `toolbarClick:false`, `osShortcut:true` | ≠0 |
| R8b2 | `toolbarClick:true`, `osShortcut:false` | ≠0 |

---

### Общо задължителни изпълнени сценария: 10+7+8+15+9+6+12+10+3+4+15 = **99**
(Suite 1=10, 2=7, 3=8, 4=15, 5=9, 6=6, 7=12, 8=10, 9=3, 10=4, 11=15.) CI извежда очаквания брой от този ID-инвентар (не от ръчно число) и пада при skip/липса/дубликат/несъответствие.
