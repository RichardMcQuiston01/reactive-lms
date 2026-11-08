# Authorization

[Back to README](../README.md)

| [With an Adapter](#with-an-adapter) | [Without an Adapter](#without-an-adapter) | [Standalone Mode](#standalone-mode) |

ReactiveLMS asks, and the host decides.

## With an Adapter

When you embed ReactiveLMS, pass a `capabilityAdapter` to `ReactiveLmsModule`. Every route then asks the adapter for permission. The checks use names such as `package.import`, `module.manage`, `launch`, and `grade.view`. The adapter can also let staff act for a learner.

[Back to Top](#authorization)

## Without an Adapter

Learner routes are limited to the learner who owns the registration. These are launch, progress, and the data routes for Sharable Content Object Reference Model (SCORM) content. One learner cannot read or write the data of another.

Administrative routes answer 403 with a message that says how to fix it. These are import, create, place, enrol, delete, people search, and rosters.

To try the library without writing an adapter, set `allowUnrestrictedAdmin: true` on `ReactiveLmsModule`. Any caller that the `IdentityAdapter` identifies can then use the administrative routes. A warning is logged at start. An adapter always takes precedence over this option.

[Back to Top](#authorization)

## Standalone Mode

The standalone API runs without an adapter. It has one fixed demo learner, and `allowUnrestrictedAdmin` is on. Use it for evaluation only. A host that embeds ReactiveLMS should configure an adapter.

[Back to Top](#authorization)

---

[Back to README](../README.md)
