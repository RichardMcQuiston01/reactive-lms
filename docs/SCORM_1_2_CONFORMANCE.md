# SCORM 1.2 conformance status

What has been checked against SCORM 1.2, how, and what has not.

**The official ADL Test Suite has not been run, and cannot be on a current
system.** It is a Windows application published by ADL, and it does not run on
modern computers. Until it is run, ReactiveLMS does not claim SCORM 1.2
certification. What is below is an automated check written from the SCORM 1.2
specification, plus the gaps found while writing it.

SCORM Cloud has been used to validate packages exported by `lms-package-maker`.
That checks the packages (the content side) against another vendor's engine. It
does not test this LMS, so it is not evidence of LMS conformance. Packages that
play correctly there are useful as known-good inputs for ReactiveLMS.

## What is checked automatically

`packages/core/src/runtimes/scorm/scorm12-rte-conformance.test.ts` exercises
the API adapter a SCO calls (`window.API`, backed by `CmiStore`) against the
Run-Time Environment rules. It runs in CI with the rest of the tests.

| Area (RTE book) | Checked |
| --- | --- |
| API methods (3.3) | `LMSInitialize`, `LMSFinish`, `LMSCommit` accept only `""` (201); initialize twice is 101; every method before initialize or after finish is 301; return values are the strings `"true"` and `"false"`; `LMSGetLastError` is not cleared by reading it, and each call replaces it; `LMSGetErrorString` returns the specified text for each defined code and `""` for others; `LMSGetDiagnostic` always returns a string; the error functions work before initialize |
| Data model rules (3.4) | empty element name 201; unknown element 401; `_children` lists exactly as specified; writing `_children` or `_count` is 402; `_children` on an element with none is 202; `_count` on a non-array is 203; `cmi.objectives._count` starts at 0 and grows |
| `cmi.core.*` (3.4.2) | access (read only, write only, read write) for every element; `lesson_location` at most 255 characters; `lesson_status` takes exactly the six values; scores are blank or 0 to 100 and read as blank, not an error, until set; `exit` vocabulary; `session_time` timespan format; wrong type, range, or vocabulary is 405; non-string, non-number values are 201 |
| `cmi.interactions.n.*` | write-only fields (404 to read), vocabularies for `type` and `result`, the 24-hour time format, timespans, 255-character limits, `_count` for interactions and for each one's objectives and correct responses, keyword errors, and the index limit |
| `cmi.suspend_data` | at most 4096 characters, 405 beyond |
| `cmi.objectives.n.*` | id, score, status, with the same range and vocabulary rules |
| `cmi.student_data.*` | values come from the manifest and are read only |
| Across launches | saved values are read back by the next session; `session_time` is added to `total_time`; LMS-owned values cannot be overwritten by saved data |

The same rules are also checked through the object the player installs as
`window.API` (`scorm-api-bridge.test.ts`), and the whole path (import, launch,
bookmark, score, complete, resume, mastery score) has been run in a real
browser against the standalone API and a database. See the fixture packages in
`packages/core/test-fixtures/scorm12`.

## Found and fixed while writing the checks

- Invalid values answered 351, and unset optional values answered 391. Neither
  is a SCORM 1.2 code. Invalid type, range, or vocabulary is now 405, and an
  unset score reads as blank with no error.
- Scores accepted any decimal. They are limited to 0 to 100.
- `lesson_location` and `suspend_data` had no length limit.
- `_children` and `_count` on elements that do not have them answered 401
  instead of 202 and 203, and writing `cmi.objectives._count` was 403, not 402.
- A second `LMSFinish` answered 101 instead of 301.
- `LMSGetErrorString` of an unknown code returned text instead of `""`, and the
  405, 202, and 203 strings did not exist.

## Interactions

`cmi.interactions` is implemented. A SCO records what the learner did and
cannot read it back (404). Each answer is stored as a row in
`rlms_interaction_response`, tied to its attempt, and an administrator can read
them with `GET /registrations/:id/interactions` (optionally `?moduleId=`).
In the admin, the Progress screen links each person to an Answers screen that
lists them by attempt.

- A session that records any interactions replaces that attempt's earlier
  rows; a session that records none (a review, or finishing a resumed lesson)
  keeps them. Rows from other attempts are kept, so each launch's answers stay
  reviewable.
- Every session numbers its interactions from 0, so the SCO is never shown the
  previous session's.
- Index limit: 9999. The specification sets none, and this keeps one SCO from
  making the LMS hold an unbounded list.
- `id` and the other identifiers are limited by length (255) only. The
  specification also restricts the characters, but authoring tools write ids
  with spaces and punctuation, and refusing them would drop the answer.
- `student_response` and `correct_responses.m.pattern` are limited to 255
  characters; their per-type syntax is not checked.

## Assets

A resource marked `adlcp:scormtype="asset"` is a page or file with no script
that talks to the LMS, so it can never report that it was seen. Opening it is
the only signal there is, so a normal launch marks its module completed (the
success status and any score already recorded are kept) and closes the
attempt. Browse and Review launches record nothing. A SCO is never treated
this way: it completes through its own API calls.

## Not implemented

These are optional in SCORM 1.2. An unsupported element answers 401, which
lets a SCO fall back.

- `cmi.student_preference.*`
- `cmi.comments_from_lms`
- `cmi.comments` is stored as written; the specification's rule for repeated
  writes has not been checked against the book and is not tested
- `credit` / `no-credit`: the adapter always reports `credit`
- Time limits (`maxtimeallowed`, `timelimitaction`) are passed to the SCO but
  not enforced by the LMS

## Content Aggregation Model

`scorm12-cam-conformance.test.ts` checks the importer against the manifest
rules of SCORM 1.2 (IMS Content Packaging 1.1.2 with ADL's extensions). A
manifest that breaks one is refused at import with the item or resource and the
problem named.

| Rule | Result |
| --- | --- |
| The default organization must be one of the organizations; organization ids are unique | refused |
| Every item has an identifier, and item ids are unique across the tree | refused |
| An item's `identifierref` names a resource the manifest defines | refused |
| Every resource has an identifier, and resource ids are unique | refused |
| Resource `type`, when given, is `webcontent`; `adlcp:scormtype`, when given, is `sco` or `asset` (any letter case) | refused |
| A resource an item launches has an `href`, and the file exists, inside the package, with the exact letter case | refused |
| A `dependency` names a resource the manifest defines | refused |
| `adlcp:masteryscore` is a number from 0 to 100 | refused |
| `adlcp:timelimitaction` is one of the four defined values | refused |
| `adlcp:maxtimeallowed` is a time span (`HH:MM:SS`, hours of two to four digits) | refused |
| `adlcp:datafromlms` is at most 255 characters | refused |
| Heading items with no resource, items that share a resource, and resources no item launches | accepted |

Read leniently, because no LMS behaviour depends on them or real authoring
tools break them: a missing `adlcp:scormtype`, an omitted `default` on
`<organizations>` (the first organization is used), `<metadata>` beyond the
schema version, `<file>` lists (the launch file is checked, the others are
not), `isvisible`, and `adlcp:prerequisites`.
- **ADL's catalogue of valid and invalid packages**, which the official suite
  imports and compares against the LMS's response. The rules above are written
  from the specification, so ADL's packages may find cases they miss.
- **XML Schema validation** of manifests against the IMS and ADL schemas.
  Manifests are read leniently, so a package that does not validate may still
  import.
- Behaviours the specification leaves to the LMS, such as what status to set
  when a SCO finishes without setting one.

## To run the official suite

This is blocked for now: the suite does not run on current systems. If it can
be run, for example in a virtual machine with a supported older Windows or after
it has been ported, the steps are:

1. Get the ADL SCORM 1.2 Test Suite from ADL (a Windows application).
2. Start the standalone API and a database (see the README).
3. Follow the suite's own instructions for testing an LMS, and run the
   Run-Time Environment and Content Aggregation Model tests. How the suite
   reaches the LMS has not been confirmed here.
4. Record the result here, and fix what it reports.

Until then, the practical checks are the automated suites above, the fixture
packages, and packages from other tools that are known to be good.
