# Contributing

## The one contribution worth more than any other

**Fly a route and tell us what happened.**

No route produced by this tool has been flown yet. Every exporter is built
against real files and covered by tests, but tests verify what we believed, not
what the aircraft does. One report from a real flight is worth more than a
month of work here.

[docs/verificar-no-campo.md](docs/verificar-no-campo.md) has a small test route —
four waypoints in a square, deliberately without technical interest — and a
table of what to observe, in order, with what each outcome means. Open an issue
with whatever you saw, including the failures.

## The second: a `droneEnumValue` for your aircraft

Inside every waypoint mission there is a number that tells the aircraft whether
the file is meant for it. Get it wrong and the aircraft either refuses the
route or, worse, accepts it and behaves as a different model.

For the enterprise line these are published. **For the consumer line — Mini,
Air — they are not.** That is why only the Mini 5 Pro is listed: its value came
out of a real file.

If you own an aircraft that is missing:

1. Create any waypoint mission in the DJI app and export it.
2. The `.kmz` is a zip. Open `wpmz/waylines.wpml` in a text editor.
3. Find `<wpml:droneEnumValue>` and `<wpml:droneSubEnumValue>` near the top.
   If your aircraft has a fixed camera, `<wpml:payloadEnumValue>` too.
4. Open an issue with the model name and those numbers.

Do not guess. A wrong number produces no error — it produces a route that does
not fly, which somebody discovers in a field with a spent battery.

## Code

```bash
npm install
npm test          # unit and component tests
npm run e2e       # end to end, against a production build
npm run lint
npm run build     # lint, types, bundle, and a check that nothing is missing
```

A few conventions that are not obvious from the outside:

- **The interface and the comments are in European Portuguese.** Keep it that
  way in code you touch; issues and pull request descriptions in English are
  fine.
- **Comments explain why, not what.** Most of them record a defect that was
  paid for once already. If you remove one, say what made it obsolete.
- **Do not invent specifications.** Anything unconfirmed goes in the
  `porConfirmar` list on the aircraft, so the app can say so. A plausible number
  is worse than a missing one, because nobody checks it.
- **Tests pin decisions, not implementations.** If a test fails after your
  change, read what it says before changing it — several of them describe
  defects that took a morning to find.

## Reporting a bug

What helps most, in order: what you expected, what happened, and the `.kmz` if
one was involved. A route that the aircraft refused is a gift — attach it.
