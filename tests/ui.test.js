/* Smoke test for UI.pluralForm (assets/js/ui.js). */
test('UI.pluralForm: Ukrainian plural forms', function () {
  assertEqual(UI.pluralForm(1, 'пара', 'пари', 'пар'), 'пара');
  assertEqual(UI.pluralForm(3, 'пара', 'пари', 'пар'), 'пари');
  assertEqual(UI.pluralForm(5, 'пара', 'пари', 'пар'), 'пар');
  assertEqual(UI.pluralForm(11, 'пара', 'пари', 'пар'), 'пар');
  assertEqual(UI.pluralForm(21, 'пара', 'пари', 'пар'), 'пара');
  assertEqual(UI.plural(3, 'пара', 'пари', 'пар'), '3 пари');
});
