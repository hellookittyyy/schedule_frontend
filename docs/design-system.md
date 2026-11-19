# Design system (Mosaic) — короткий довідник

Джерело правди для UI після редизайну (план: `docs/plans/0001-mosaic-redesign.md`).

## Код
- `assets/css/tokens.css` — змінні: кольори, відступи, радіуси, тіні, світла/темна тема.
- `assets/css/base.css` — reset, типографіка, базові елементи.
- `assets/css/components.css` — кнопки, форми, таблиці, бейджі, тости, drawer.
- `assets/css/shell.css` — каркас сторінки (сайдбар, топбар), усі класи з префіксом `sh-`.
- `assets/js/api.js` — `Api.request` / `apiRequest` та `API_BASE_URL`.
- `assets/js/ui.js` — `UI.toast` (з дією «Скасувати»), `UI.confirmInline` (inline «Так/Ні» замість модалок видалення), `UI.drawer`, `UI.state` (loading/empty/error), `UI.escapeHtml`, `UI.dnd` (drag & drop для тижневої сітки; додається). Модалок за дизайном немає; `showToast/showModal/hideModal` — тимчасові аліаси до фази 9.
- `assets/js/icons.js` — `Icons.svg` / `ic` (набір іконок).
- `assets/js/shell.js` — `Shell.render/setTitle/setCrumbs/actionsEl` (сайдбар, топбар, активний пункт).
- `assets/js/theme-boot.js` — `Theme.get/set/toggle`; тема в `localStorage` під ключем `theme`, застосовується до першого малювання (у `<head>`).

## Референс
- `design/final/mosaic.html` — еталонний макет.
- `design/system.html` — жива сторінка системи (компоненти зі справжніх CSS).

## Правила (план §4)
1. Лише класичні `<script>` (без ES-модулів, без збірки).
2. Тільки токени: жодних власних кольорів/відтінків на окремих сторінках.
3. Префікс `sh-` — тільки для класів каркаса (shell).
4. `--c1…--c6` — лише заливки (фони плиток, смуги); ніколи не колір тексту на світлому фоні.
5. Нова сторінка = підключити tokens → base → components → shell + `theme-boot.js` у head.
6. Поведінка сторінок не змінюється: перевіряти за `docs/regression-checklist.md`.

## Контраст (WCAG, перевірено; світла / темна)
- text на bg: 14.70 / 15.19; muted на bg: 6.17 / 7.44; muted на surface: 6.78 / 6.74.
- exam на exam-soft: 5.73 / 7.20; text на exam-soft: 13.42 / 11.76.
- lec / pr / lab на soft: 5.95 / 4.83 / 4.81 (світла); 7.11 / 8.05 / 6.95 (темна).
- nav-text на nav-bg: 7.40 / 6.75; підпис групи nav (80% mix): 5.25 / 4.71.
- Позначки nav c1–c6 на nav-bg (потрібно ≥3:1): світла 7.24 / 11.20 / 8.95 / 7.25 / 8.56 / 11.30; темна 8.50 / 13.15 / 10.51 / 8.51 / 10.06 / 13.27.
- on-c на c1–c6: 7.24 / 11.20 / 8.95 / 7.25 / 8.56 / 11.30.
- Правило: `--faint` не проходить 4.5:1 (2.59 у світлій) — лише для рамок, плейсхолдерів, роздільників, ніколи для тексту; вторинний текст — `--muted`.
