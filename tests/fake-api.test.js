/* Proves the apiRequest seam: Checks.data calls the bare apiRequest, which FakeApi replaces. */
test('FakeApi: Checks.data reads through the replaced apiRequest', function () {
  var groups = [{ id: 1, name: 'ФЕІ-21', amount: 20 }];
  FakeApi.install();
  Checks.invalidate();
  FakeApi.route('GET /semesters/1/', { id: 1, name: 'Осінній' });
  FakeApi.route('GET /semesters/1/slots/', []);
  FakeApi.route('GET /study_plans/?semester=1', []);
  FakeApi.route('GET /groups/', groups);
  FakeApi.route('GET /streams/', []);
  FakeApi.route('GET /subjects/', []);
  FakeApi.route('GET /teachers/', []);
  FakeApi.route('GET /rooms/', []);

  function cleanup() {
    FakeApi.reset();
    Checks.invalidate();
  }

  return Checks.data(1).then(function (d) {
    try {
      assertEqual(d.groups, groups, 'groups come from the fixture');
      assertEqual(FakeApi.calls.length, 8, 'eight list endpoints were requested');
    } finally {
      cleanup();
    }
  }, function (err) {
    cleanup();
    throw err;
  });
});
