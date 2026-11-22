# Releasing

[Back to README](../README.md)

| [Which Packages](#which-packages) | [Add a Changeset](#add-a-changeset) | [Prerelease Mode](#prerelease-mode) | [Cut a Release](#cut-a-release) | [Check Before You Release](#check-before-you-release) |

This page explains how package versions are chosen and published. It uses [Changesets](https://github.com/changesets/changesets). Nothing has been published yet.

## Which Packages

Four packages are released: `shared`, `persistence`, `core`, and `nest`. Each has its own version and its own `CHANGELOG.md`. The other packages are private and are never versioned or published.

The root `CHANGELOG.md` is separate. It tells the story of the whole project and is written by hand.

[Back to Top](#releasing)

## Add a Changeset

A changeset is a small file in the `.changeset` folder. It says which packages changed, how big the change is, and what to tell readers. Add one to any pull request that changes what a user of a package would see.

1. Run `bunx changeset`.
2. Pick the packages that changed.
3. Pick `patch`, `minor`, or `major` for each one.
4. Write a short note. It goes into the changelog, so write it for a reader of the package.
5. Commit the new file with your pull request.

A change that needs no release, such as a docs fix, needs no changeset. If a check asks for one, run `bunx changeset --empty`.

[Back to Top](#releasing)

## Prerelease Mode

Until 1.0.0, the repository stays in prerelease mode with the tag `next`. The file `.changeset/pre.json` turns this on. Versions look like `0.4.1-next.0`, and every release is published under the `next` tag, never `latest`. The first `latest` release is 1.0.0.

The four packages start from version `0.4.0`, which was never published. The first changeset is a `patch`, so the first preview is `0.4.1-next.0`.

Before 1.0.0, run `bunx changeset pre exit`. Then the next release is a normal one.

[Back to Top](#releasing)

## Cut a Release

1. In a pull request, run `bunx changeset version`. It uses up the changeset files, raises the versions, and writes each package's `CHANGELOG.md`.
2. Merge that pull request into `dev`, then promote `dev` to `main`.
3. Tag the release on `main` and publish with npm provenance.

The publish step is not set up yet. It needs a release workflow and an npm token, which only the project owner can add.

[Back to Top](#releasing)

## Check Before You Release

- Run `bun run verify:packages`. It packs the four packages, installs them into an empty project, and loads them with plain Node.
- Run `bunx changeset publish-plan`. It lists which packages would be published, at which version, and under which tag.
- Run `bunx changeset status --since=origin/main`. It lists the packages that will change and by how much.

[Back to Top](#releasing)

---

[Back to README](../README.md)
