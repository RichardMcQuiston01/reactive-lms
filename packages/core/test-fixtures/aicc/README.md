# AICC fixture packages

Small, original AICC (level 1) courses used by the tests in `packages/core`.
Each folder is one package: the test zips it, imports it, and checks what the
importer makes of it. They are written to look like what authoring tools
produce, including the awkward parts.

| Folder              | What it covers                                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `single-au`         | One assignable unit under `ROOT`, with a mastery score, CRLF line endings, and the lower-case file names the `lms-package-maker` export uses.                                                                                                       |
| `blocks-and-params` | Upper-case file names, a byte order mark, LF line endings, a comment in the `.crs`, blocks nested under `ROOT`, `web_launch` parameters, a file name with a space, quoted fields with commas and quotes, a time limit and its action, and `core_vendor` data. |

The content here is original and may be used freely under the repository
license.
