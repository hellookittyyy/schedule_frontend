/* Tests for the pure parts of assets/js/checks.js: evaluate, readiness, stages. */

function checksFixture(o) {
  o = o || {};
  return {
    semester: { id: 1 },
    slots: o.slots || [],
    plans: o.plans || [],
    groups: o.groups || [],
    streams: o.streams || [],
    subjects: o.subjects || [],
    teachers: o.teachers || [],
    rooms: o.rooms || []
  };
}

function checksById(list, id) {
  return list.find(function (c) { return c.id === id; });
}

test('Checks.evaluate: timeslots & rooms flip at their threshold', function () {
  var empty = Checks.evaluate(1, checksFixture());
  assertEqual(checksById(empty, 'timeslots').severity, 'block');
  assertEqual(checksById(empty, 'rooms').severity, 'block');

  var filled = Checks.evaluate(1, checksFixture({ slots: [{ id: 1 }], rooms: [{ id: 1, name: '101', capacity: 20, room_type: 1 }] }));
  assertEqual(checksById(filled, 'timeslots').severity, 'ok');
  assertEqual(checksById(filled, 'rooms').severity, 'ok');
});

test('Checks.evaluate: plans, groups-without-plan, plans-without-room flip at their threshold', function () {
  var group = { id: 1, name: 'ФЕІ-21', amount: 20 };
  var room = { id: 1, name: '101', capacity: 30, room_type: 1 };
  var plan = { id: 1, subject: 10, group: 1, required_room_type: 1, teacher: null };

  var noPlans = Checks.evaluate(1, checksFixture({ groups: [group], rooms: [room], subjects: [{ id: 10, name: 'S' }] }));
  assertEqual(checksById(noPlans, 'plans').severity, 'block');

  var direct = Checks.evaluate(1, checksFixture({ groups: [group], rooms: [room], subjects: [{ id: 10, name: 'S' }], plans: [plan] }));
  assertEqual(checksById(direct, 'plans').severity, 'ok');
  assertEqual(checksById(direct, 'groups-without-plan').severity, 'ok');
  assertEqual(checksById(direct, 'plans-without-room').severity, 'ok');

  var missingGroup = Checks.evaluate(1, checksFixture({
    groups: [group, { id: 2, name: 'ФЕІ-22', amount: 20 }],
    rooms: [room], subjects: [{ id: 10, name: 'S' }], plans: [plan]
  }));
  var noPlan = checksById(missingGroup, 'groups-without-plan');
  assertEqual(noPlan.severity, 'warn');
  assertEqual(noPlan.items, [{ id: 2, label: 'ФЕІ-22' }]);

  var tooBig = Checks.evaluate(1, checksFixture({
    groups: [{ id: 1, name: 'ФЕІ-21', amount: 50 }],
    rooms: [room], subjects: [{ id: 10, name: 'S' }],
    plans: [{ id: 2, subject: 10, group: 1, required_room_type: 1, teacher: null }]
  }));
  assertEqual(checksById(tooBig, 'plans-without-room').severity, 'warn');
  assertEqual(checksById(tooBig, 'plans-without-room').items.length, 1);

  var wrongType = Checks.evaluate(1, checksFixture({
    groups: [group], rooms: [room], subjects: [{ id: 10, name: 'S' }],
    plans: [{ id: 3, subject: 10, group: 1, required_room_type: 2, teacher: null }]
  }));
  assertEqual(checksById(wrongType, 'plans-without-room').severity, 'warn');
});

test('Checks.evaluate: teacher/subject checks flip at their threshold', function () {
  var group = { id: 1, name: 'ФЕІ-21', amount: 20 };
  var room = { id: 1, name: '101', capacity: 30, room_type: 1 };
  var subject = { id: 10, name: 'Математика' };
  var plan = { id: 1, subject: 10, group: 1, required_room_type: 1, teacher: 1 };

  var mismatch = Checks.evaluate(1, checksFixture({
    groups: [group], rooms: [room], subjects: [subject], plans: [plan],
    teachers: [{ id: 1, name: 'Іваненко', subjects: [11] }]
  }));
  var badTeacher = checksById(mismatch, 'teacher-not-on-subject');
  assertEqual(badTeacher.severity, 'warn');
  assertEqual(badTeacher.items.length, 1);

  var noTeacher = Checks.evaluate(1, checksFixture({ subjects: [subject], teachers: [] }));
  assertEqual(checksById(noTeacher, 'subjects-without-teacher').severity, 'tip');

  var teacherNoSubjects = Checks.evaluate(1, checksFixture({ teachers: [{ id: 1, name: 'Іваненко', subjects: [] }] }));
  assertEqual(checksById(teacherNoSubjects, 'teachers-without-subjects').severity, 'tip');

  var good = Checks.evaluate(1, checksFixture({
    groups: [group], rooms: [room], subjects: [subject], plans: [plan],
    teachers: [{ id: 1, name: 'Іваненко', subjects: [10] }]
  }));
  ['groups-without-plan', 'plans-without-room', 'teacher-not-on-subject',
    'subjects-without-teacher', 'teachers-without-subjects'].forEach(function (id) {
    assertEqual(checksById(good, id).severity, 'ok', id + ' is ok');
  });
});

test('Checks.readiness: caps at 50 only with a blocker', function () {
  var warn = Checks.readiness([{ severity: 'ok' }, { severity: 'ok' }, { severity: 'ok' }, { severity: 'warn' }]);
  assertEqual(warn, { pct: 75, passed: 3, total: 4, blocks: 0, capped: false });

  var block = Checks.readiness([{ severity: 'ok' }, { severity: 'ok' }, { severity: 'ok' }, { severity: 'block' }]);
  assertEqual(block, { pct: 50, passed: 3, total: 4, blocks: 1, capped: true });

  var empty = Checks.readiness([]);
  assertEqual(empty.pct, 0);
  assertEqual(empty.total, 0);
  assertEqual(empty.blocks, 0);
  assertEqual(empty.capped, false);
});

test('Checks.stages: empty semester', function () {
  var empty = Checks.stages(checksFixture(), []);
  assertEqual(empty.map(function (s) { return s.id; }), ['calendar', 'resources', 'plans', 'constraints', 'generation']);
  empty.forEach(function (s) { assertEqual(s.done, false, s.id + ' is not done'); });
  assertEqual(['calendar', 'resources', 'plans', 'generation'].map(function (id) {
    return checksById(empty, id).req;
  }), [true, true, true, true]);
  assert(!checksById(empty, 'constraints').req, 'constraints has no req');
  assertEqual(checksById(empty, 'generation').meta, 'не запускали');

  var blocked = Checks.stages(checksFixture(), [{ severity: 'block' }]);
  assertEqual(checksById(blocked, 'generation').meta, 'блокерів: 1');
});

test('Checks.stages: ready semester', function () {
  var d = checksFixture({
    slots: [{ id: 1 }],
    rooms: [{ id: 1, name: '101', capacity: 30, room_type: 1 }],
    teachers: [{ id: 1, name: 'Іваненко', subjects: [10] }],
    groups: [{ id: 1, name: 'ФЕІ-21', amount: 20 }],
    subjects: [{ id: 10, name: 'Математика' }],
    plans: [{ id: 1, subject: 10, group: 1, required_room_type: 1, teacher: 1 }]
  });
  var list = Checks.stages(d, Checks.evaluate(1, d), { constraints: 2, lessons: 10 });
  list.forEach(function (s) { assertEqual(s.done, true, s.id + ' is done'); });
});

test('Checks.stages: plans for only some groups, direct and via a stream', function () {
  var d = checksFixture({
    groups: [{ id: 1, name: 'ФЕІ-21', amount: 20 }, { id: 2, name: 'ФЕІ-22', amount: 20 }],
    subjects: [{ id: 10, name: 'Математика' }],
    plans: [{ id: 1, subject: 10, group: 1, required_room_type: 1, teacher: null }]
  });
  var partial = checksById(Checks.stages(d, []), 'plans');
  assertEqual(partial.done, false);
  assertEqual(partial.meta, '1 з 2 груп');

  d.streams = [{ id: 1, groups: [1, 2] }];
  d.plans = [{ id: 2, subject: 10, stream: 1, required_room_type: 1, teacher: null }];
  var full = checksById(Checks.stages(d, []), 'plans');
  assertEqual(full.done, true);
  assertEqual(full.meta, '2 з 2 груп');

  d.streams = [{ id: 1, groups_details: [{ id: 1 }, { id: 2 }] }];
  var viaDetails = checksById(Checks.stages(d, []), 'plans');
  assertEqual(viaDetails.done, true);
  assertEqual(viaDetails.meta, '2 з 2 груп');
});
