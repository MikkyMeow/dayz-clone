# Карта кода

## Корень

| Файл | Назначение |
|---|---|
| `index.html` | Canvas, меню, HUD, game-over, рюкзак, подключение скриптов. ID элементов — контракт с `ui.js` и `main.js`. |
| `styles.css` | Полная адаптивная стилизация экранов и HUD. |
| `config.js` | Глобальная браузерная копия баланса (`window.GAME_CONFIG`); сейчас загружается HTML, но ES-модули используют shared-конфиг. |
| `manifest.webmanifest` | PWA metadata. |
| `package.json` | ESM, команды start/dev/test, зависимость `ws`. |
| `README.md` | Краткий пользовательский запуск и управление. |

## Клиент `js/`

| Файл | Ответственность и важные связи |
|---|---|
| `main.js` | Composition root, выбор режима, game loop, маршрутизация действий между локальной реализацией и сетью. |
| `state.js` | Создание клиентского состояния, стартовый инвентарь и single-player лут. |
| `gameplay.js` | Single-player движение, survival, инвентарь, двери, spawn/update orchestration. |
| `combat.js` | Single-player melee/ranged атаки игрока. |
| `zombies.js` | Single-player FSM, движение, атаки, spawn/despawn. |
| `zombie-perception.js` | Зрение и слух single-player зомби. |
| `noise.js` | Краткоживущие источники шума и выбор слышимого сигнала. |
| `navigation.js` | A*, clearance-кэши, projection, smoothing и кадровый бюджет. |
| `world.js` | Карта, здания, двери, obstacle grid, collision, LOS, attack path, spawn points. Импортируется сервером. |
| `spatial-grid.js` | Универсальный индекс AABB; сейчас ускоряет препятствия и покрыт отдельно тестами. |
| `renderer.js` | Canvas 2D, чанки мира, culling, сущности, эффекты, день/ночь, mobile sticks, AI debug. |
| `camera.js` | Камера и расширенные bounds. |
| `display.js` | Canvas context, resize, device/render pixel ratio. |
| `effects.js` | Частицы и затухание трассеров. |
| `input.js` | Клавиатура, мышь, touch dual-stick; вызывает переданные actions. |
| `ui.js` | HUD, рюкзак, сообщения, location и overlays. |
| `multiplayer-client.js` | WebSocket lifecycle, отправка input/action, применение snapshots/events, интерполяция. |
| `performance.js` | Опциональные измерения FPS/update/render/culling/snapshot size. |
| `config.js` | Re-export `C` из `shared/config.js`. |
| `utils.js` | `clamp`, евклидово расстояние, random. Импортируется сервером. |

## Сервер и shared

| Файл | Ответственность |
|---|---|
| `shared/config.js` | Канонический ESM-конфиг клиента и сервера. |
| `server/index.js` | Static HTTP, `/health`, WebSocket lifecycle, rate limit, ticks/snapshots, shutdown. |
| `server/protocol.js` | Версия, размер и синтаксическая валидация входящих сообщений. |
| `server/game-session.js` | Авторитетная PvP-сессия: игроки, движение, combat, inventory, loot, doors, zombies, AOI snapshots. |
| `server/player-store.js` | Загрузка и атомарная запись постоянного состояния PvP-персонажей. |

## Тесты

| Файл | Защищаемые контракты |
|---|---|
| `combat.test.js` | Melee windup/targeting, двери и урон выстрела. |
| `navigation.test.js` | Геометрия, A*, projection, budget, двери и блокировка проёма. |
| `zombie-ai.test.js` | Зрение, слух, FSM и обход здания. |
| `server-session.test.js` | Протокол, stale input, shared loot, PvP death/respawn, AOI. |
| `spatial-grid.test.js` | Вставка/query/update/remove и bounds. |

## Карта типичного изменения

| Изменение | Проверить в первую очередь |
|---|---|
| Новый предмет | config, state, gameplay, GameSession, UI, renderer, protocol payload, tests |
| Новое оружие | `C.weapons`, обе таблицы item→weapon, combat, GameSession.attack, renderer/UI, events/tests |
| Новая сущность | state/session ownership, IDs, AOI snapshot, reconciliation, renderer/culling, collision, tests |
| Новый input | HTML/HUD, input, main routing, protocol action, GameSession validation, mobile/desktop |
| Изменение карты | world geometry, chunk rendering, obstacle grid, doors, navigation invalidation, server determinism |
| Изменение AI | single FSM/perception/navigation и отдельно server AI; debug/tests/performance |
| Новый UI | HTML ID, styles, `ui` registry, rendering/update lifecycle, touch safe areas/accessibility |
