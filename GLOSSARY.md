# Schedule admin (frontend)

The admin and public pages where staff prepare a semester's resources and study plans, check readiness, and generate and view the timetable.

## Semester preparation

**Semester** (Семестр):
A scheduling period with its own time slots, study plans and constraints; one semester is marked current.
_Avoid_: term, period

**Time slot** (Слот):
One dated lesson period of a semester, identified by day of week and period number.
_Avoid_: slot cell, timeslot entry

**Period** (Пара):
The numbered lesson position within a day.
_Avoid_: lesson number, hour

**Study plan** (Навчальний план):
A requirement that a group or a stream gets a number of lessons of one subject and class type from one teacher in a semester.
_Avoid_: curriculum, load

**Stream** (Потік):
A set of groups taught together.
_Avoid_: flow, cohort

**Constraint** (Обмеження):
A rule the generator must respect in a semester, such as a teacher's day off or blocked periods.
_Avoid_: restriction, rule

## Readiness

**Check** (Перевірка):
One preflight condition evaluated for a semester, with a severity of block, warn, tip or ok.
_Avoid_: validation, test

**Blocker** (Блокер):
A check with severity block; while any exists, generation is not allowed.
_Avoid_: error, critical

**Readiness** (Готовність):
The share of a semester's checks that pass, capped at 50% while any blocker exists.
_Avoid_: progress, score

**Stage** (Етап):
One of the ordered steps of preparing a semester: calendar, resources, plans, constraints, generation.
_Avoid_: step, phase

**Task** (Задача):
A failed check presented as something to fix.
_Avoid_: issue, todo

## Directories

**Record** (Запис):
One saved item of a directory (a subject, group, teacher, stream, room or constraint).
_Avoid_: entity, row

**Draft** (Новий запис):
A record being created that does not exist on the server yet.
_Avoid_: new item, unsaved record

**Promotion**:
The moment a draft's first save succeeds and it becomes a record.
_Avoid_: first save, conversion
