# SCORM 1.2 fixture packages

Small, original SCORM 1.2 courses used by the tests in `packages/core`. Each
folder is one package: the test zips it, imports it, and checks what the
importer and runtime make of it. They are written to look like what authoring
tools produce, including the awkward parts, so a manifest or launch problem
shows up here before it shows up in a real course.

| Folder                | What it covers                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `simple-sco`          | One SCO that runs the usual API calls: initialize, read the learner, set a bookmark, score and status, commit, finish.                                                       |
| `chapters-and-assets` | Two organizations (the second is the default), a chapter with nested items, an asset launched before the first SCO, shared files, entities, comments, CDATA, unicode, and `datafromlms`. |
| `bookmark-resume`     | A SCO that bookmarks on its first launch and reports `resumed` with the saved location, `suspend_data`, and mastery score on its second, then finishes with a score and writes `completed` (the LMS turns that into passed or failed from the manifest's `masteryscore`).                                                       |
| `xml-base`            | Resource paths that depend on `xml:base` at the `resources` and `resource` level.                                                                                              |
| `launch-parameters`   | An item `parameters` string, with and without a query already on the resource `href`.                                                                                          |

Each SCO page writes what it did into the page (`#outcome`, `#status`) so a
browser run can check it without reading the LMS.

The content here is original and may be used freely under the repository
license.
