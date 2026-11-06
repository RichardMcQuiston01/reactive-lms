# SCORM 1.2 conformance status

What has been checked against SCORM 1.2, how, and what has not.

**The official ADL Test Suite has not been run.** It is a Windows application
published by ADL, and it could not be downloaded or run where this was built.
Until it is run, ReactiveLMS does not claim SCORM 1.2 certification. What is
below is an automated check written from the SCORM 1.2 specification, plus the
gaps found while writing it.

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
cannot read it back (404). The answers are stored on the attempt's progress
record, and are not yet shown anywhere.

- A session that records any interactions replaces the earlier ones; a session
  that records none (a review, or finishing a resumed lesson) keeps them. The
  history of earlier sessions is not kept.
- Every session numbers its interactions from 0, so the SCO is never shown the
  previous session's.
- Index limit: 9999. The specification sets none, and this keeps one SCO from
  making the LMS hold an unbounded list.
- `id` and the other identifiers are limited by length (255) only. The
  specification also restricts the characters, but authoring tools write ids
  with spaces and punctuation, and refusing them would drop the answer.
- `student_response` and `correct_responses.m.pattern` are limited to 255
  characters; their per-type syntax is not checked.

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

## Not checked

- **Content Aggregation Model checks** the ADL suite makes: importing its
  catalogue of valid and invalid packages and comparing the LMS's response.
  The importer is covered by the fixture packages and by tests for broken
  exports, but not against ADL's packages.
- **XML Schema validation** of manifests against the IMS and ADL schemas.
  Manifests are read leniently, so a package that does not validate may still
  import.
- Behaviours the specification leaves to the LMS, such as what status to set
  when a SCO finishes without setting one.

## To run the official suite

1. Get the ADL SCORM 1.2 Test Suite from ADL (a Windows application).
2. Start the standalone API and a database (see the README).
3. Point the suite at the LMS's launch page, following its LMS test
   instructions, and run the Run-Time Environment and Content Aggregation
   Model tests.
4. Record the result here, and fix what it reports.
