# Changelog

Nothing here has been flown yet. See
[what to verify in the field](docs/verificar-no-campo.md).

Dates are omitted on purpose: the project was built in a short burst and the
ordering below is the useful part, not the calendar.

---

## Unreleased

### Added

- **Reaching many waypoints at once.** Bulk editing was already all there: the
  photo action applied to the whole selection, the altitude that rises ten
  metres on every one without flattening the differences between them, the
  "several values" placeholder on fields that diverge. What was missing was any
  way to reach twenty points other than clicking them one at a time with ctrl
  held — and on a three-hundred-point coverage route that is not uncomfortable,
  it is impossible.

  A button now selects whatever the filter is showing, and that is where the
  power is: filter by "no photo", click it, and you have exactly the points that
  need one without anyone counting them. `Ctrl+A` takes the whole route. And
  shift on the map now takes the range rather than repeating what ctrl does —
  the map being precisely where you can see which pass you want.

- **The aircraft banks into its own acceleration.** A multirotor has no other way
  to move than to tilt its thrust: the horizontal component is what pushes it,
  and the angle is `atan(a/g)`. No coefficient, no chosen constant — just
  gravity. Accelerating forward drops the nose; releasing the stick raises it,
  because braking is acceleration too.

  For there to be acceleration to take that from, there had to be inertia: speed
  now chases the commanded speed instead of switching on and off. That speed
  lives in the ground frame, not the aircraft's, and it has a consequence worth
  the change on its own — turning mid-transit does not turn the velocity with it,
  so the aircraft crabs until the two line up. That is what a multirotor actually
  does, and it is what stops the virtual flight from reading like a cursor.

  What is **not** modelled is cruise attitude. At constant speed a multirotor
  holds its nose slightly down against drag, and by how much depends on a power
  curve DJI does not publish. Here, constant speed is level flight, and a test
  pins that choice so it does not look like an oversight.

  The camera arrow does not roll with the aircraft, and does not even bind the
  attribute. Not a simplification: a gimbal exists precisely to hold the camera
  level while the airframe tilts.

- **The real sun lights the aircraft.** The shader had a fixed direction written
  into it, the same at nine in the morning and six in the evening — while the
  sun's position was already being computed for the site and the hour a few
  files away. Below the horizon the true direction left the aircraft as a black
  silhouette, so the light lifts and the ambient term rises, easing in across the
  eight degrees above the horizon so there is no jump at sunset. That part stops
  being physically true, and says so.

### Fixed

- **The weekly end-to-end run went green without verifying anything.** The first
  run after accounts were switched on reported success: three skipped, three
  flaky, eleven minutes. The guard used `count()`, which does not wait — on a
  cold load of the published site it returns zero before React paints, so the
  skip never fired and each test then burned its two-minute timeout looking for a
  button that was never coming. It now waits for the application to decide which
  screen it is showing before asking which one it is.

  The skip is also no longer allowed locally. Out there it is a known limitation
  to tolerate; here, an entry screen means a `.env.local` with accounts that the
  build picked up — a badly set bench, not a limitation — and it now fails saying
  exactly that, with the command to fix it.

## 0.4.0

One feature, two weight reductions, two defects, and the tests that should have
been written alongside the last release.

### Added

- **Orbit a point, looking at it the whole way round.** Coverage serves what lies
  flat — the terrain, the parcel, the field of panels. For what stands up (a
  transformer station, a met mast, a pole, an inverter tower) a grid overhead
  sees the roof and nothing else. There is no field for the camera angle, and
  that is deliberate: with the aircraft `r` metres from the axis and `h` above
  the target, the angle that points at it is `-atan(h/r)` and there is nothing to
  decide. Leaving it by hand gives a full circle with the target drifting out of
  frame halfway round, which is the one mistake an orbit can really make.

  The heading is not written in degrees either — each waypoint is tied to the POI
  in `towardPOI`. Same arithmetic, but the route stays correct after someone
  drags the point on the map, which is exactly what you do next after looking at
  an orbit.

- **A safety net under the application.** An exception in any component unmounts
  the whole tree, and what React leaves in its place is an empty `div`. To
  whoever is using this, a page that suddenly goes blank is indistinguishable
  from "I have lost everything" — and that is not what happened: the projects and
  routes are in IndexedDB, untouched, and reloading brings them all back. The net
  exists to say the two things nobody can work out alone in front of a blank
  screen. It does not try to recover: a `setState` remounting the tree that just
  blew up blows up again, and what you get is a flicker.

### Changed

- **Firebase is no longer downloaded by people who will never have an account.**
  Three hundred-odd kilobytes that everyone transferred, including everyone who
  clones the repository and — today — everyone who opens the published site. A
  mode of operation selected by environment variables cannot cost the weight of
  both modes to someone using one. First load on the preview server went from
  about 650 kB to 476 kB transferred; the main chunk from 1213 kB (373 gzipped)
  to 530 kB (167 gzipped). If the network cannot reach the chunk, the app falls
  back to local mode rather than going blank, because local mode works perfectly
  without it.

- **`proj4` no longer ships to people who never import a DXF** — forty-three
  gzipped kilobytes, on everyone's first load, for a coordinate conversion that
  only serves PT-TM06 survey import. It arrived through a link you cannot see:
  the composite terrain source, which the app always needs, lived in the same
  file as the DXF one, and that one works in PT-TM06.

### Fixed

- **The "Flagged" filter on the waypoint list ignored almost every validation.**
  It filtered on the row's own alert, which is only ground clearance outside the
  limits. No-fly zones, wind, unsupported actions and points missing their photo
  flag waypoints that carry no row alert, and none of them appeared. A filter
  called "flagged" that ignores almost every validation lies by its name, and it
  lies to whoever is in a hurry — which is exactly who uses it.

- **An orbit could ask the gimbal for an angle it does not have.** Flying below
  the target and close to it, the arithmetic that points at the centre asked for
  seventy-odd degrees up. The rest of the application works between 90 down and
  45 up, and an angle outside that is not a route that frames badly — it is a
  route the aircraft will not accept.

### Tested

- **The wind validation had only been checked by eye on screen**, and it is what
  decides whether a route exports at all. Twelve metres per second head-on
  against the fifteen a Mini 5 Pro does on a mission leaves three over the
  ground — a warning, because the route still flies, just slower. Eighteen of
  crosswind against the same fifteen is not a slow leg but a heading the aircraft
  cannot hold, and that blocks. And the case that matters most is now pinned: with
  airspeed to spare, however much wind there is, there is no complaint at all.

- **What a corrupted project file does.** Half a dozen refusals were written and
  none verified. A refusal that is not verified is one that can be lost in a
  refactor without anyone noticing, until a crooked file gets in and the
  application breaks three screens later, far from the cause.

## 0.3.0

Six features and a visual pass. The first three came out of the same question -
what does this tool still refuse to tell you that you would have to know before
leaving for site.

### Added

- **Wind, and the legs where the aircraft cannot hold it.** A waypoint mission is
  flown at ground speed: ask for 10 m/s and the aircraft does 10 m/s over the
  terrain, into wind or with it. Expecting a route to take longer against a
  headwind is thinking of an aeroplane. What changes is the tilt, and the current
  it draws — until it stops changing: holding 10 over the ground against 8 m/s of
  wind needs 18 m/s through the air, and there is a point where the aircraft
  cannot. Past it the ground speed drops, and the estimate taken to the field
  stops being true. That point is what this computes, and nothing else — vector
  geometry, with no invented constant. The only aircraft figure that enters is
  the maximum mission speed, already in the catalogue.

  It does **not** compute endurance. A headwind burns more battery, and how much
  depends on a power curve DJI does not publish; an invented percentage looks
  calculated and has nothing behind it. It fetches **no forecast**: the wind is
  typed in by hand, from the bulletin you looked up. Direction is dragged on a
  rose, because "where it blows from" versus "where it goes to" is the most
  repeated mistake in this, and an arrow seen pointing into the centre does not
  lend itself to it the way a number does. The same arrow sits on the map
  compass, so how the wind lies relative to the route on screen is visible at a
  glance.

- **A second pass at ninety degrees.** A single grid has one known problem: faces
  turned towards the passes are seen well and the perpendicular ones are always
  seen edge-on. In photogrammetry that gives melted walls in the model; in a
  solar park it gives one face of every table that is never seen square. Off by
  default, and the panel says why in numbers: on the test parcel, 17 passes and
  17.7 km against 40 passes and 36.8 km, with photos going from 799 to 1627.

- **Camera tilt on coverage.** Nadir surveys terrain; tilted sees what stands up —
  façades, structures, the face of a park's tables. The moment the camera leaves
  nadir the resolution figure disappears from the panel, and it says why: the
  spacing comes from `2h·tan(f/2)`, which describes the width a nadir camera
  covers. Tilted, the footprint becomes a trapezoid stretched forwards and the
  requested overlap is no longer what you get. A number that has become false is
  worse than no number.

- **A filter on the waypoint list.** A parcel coverage gives three hundred-odd
  waypoints, and the list stops being a list: it is a wall. Finding the point a
  validation flagged, or the one leg missing its photo action, meant scrolling and
  counting — and the counting fails. Three criteria and a number box, not a
  general expression filter that would serve every question and none of them
  quickly. It only appears above twenty points, and it always says how many were
  left out: a filter forgotten on makes a three-hundred-point route look like it
  has thirty.

- **A one-page plan summary, made to be printed.** Whoever goes to site does not
  take the planner — they take a phone with the file and, with any sense, a sheet
  of paper with what they agreed with themselves the night before. This is that
  sheet: the numbers that decide whether the flight goes well, the take-off
  coordinates, the solar window, and the validations still unresolved. It carries
  the note that no route from this tool has been flown yet, because whoever takes
  it to a field is testing the tool as much as flying the route.

- **A keyboard shortcut sheet, opened with `?`.** Every one of these commands
  already existed and none of them was written down anywhere. Virtual flight has
  fourteen keys — W A S D, Q E, Z C, the four arrows, R, and Alt for fine
  adjustment — and the only way to find them was to read the comment at the top
  of `useVooVirtual.ts`, which nobody does. `?` is the one shortcut not suspended
  during virtual flight: opening a help sheet edits nothing, and flight is
  exactly when it is needed most.

### Changed

- **The projects screen was a five-column table with one row lost in fourteen
  hundred pixels of black** — and it is the first screen anyone sees of this. It
  is now cards, with the product name and a line saying what it does. The empty
  state explains what a project is, which saves the first question entirely.

- **Weight where weight was missing.** `Export` no longer reads at the same level
  as `DXF` — outlined rather than filled, because the rest of the interface is
  meant to be looked at for hours. The four flight numbers get a panel of their
  own: they are reading, not command. The system's white scrollbars cut the
  column in half on a dark interface. A focus ring on `:focus-visible`, once, for
  everything. The centre and delete icons were flickering on every row at the
  same time, and now fade in under the cursor without moving or becoming
  unreachable by keyboard. Shadows by height rather than one for everything.
  Anyone with `prefers-reduced-motion` set gets no transition at all.

### Fixed

- **Firestore refused any document carrying `undefined` in any field**, and
  "this route has no wind set" is naturally written exactly that way. Removing
  the wind from a route made it impossible to save — and only for those with
  accounts switched on.

## 0.2.0

Seventeen commits of field-driven work: everything below came out of using the
tool on a real site and finding it wanting.

### Added

- **No-fly zones.** Import polygons the route must not cross — the transformer
  station, the neighbour's parcel, a power line corridor — and the route is
  checked against them. Drawn in red beside the green of what is to be filmed,
  and it blocks the export, because whoever marked the zone had a reason. The
  check covers whole legs and not just waypoints: on a coverage route the
  transitions between passes are the longest legs there are, and they are
  precisely the ones that cross a zone end to end without either endpoint
  falling inside it.

- **Ground resolution, in cm per pixel.** This is the number a survey
  specification is written in, not the flight altitude: two cameras at eighty
  metres cover the same ground at very different resolutions. Shown next to the
  footprint, and left out entirely for aircraft whose megapixel count is not in
  the list, because a guessed resolution is worse than none.
- **Solar window.** For the site and a chosen day, the hours when the sun is
  high enough, with the elevation curve and solar noon. In module thermography
  the real criterion is plane-of-array irradiance, which nobody knows the day
  before; sun elevation is what limits it and what a planner can actually say.
  Pure astronomy, no external service, and the threshold is editable because it
  is a rule of thumb rather than a standard.

- **Markers thin out when they would overlap.** A coverage route puts photos
  twenty metres apart: seen from above, a hundred and eight numbered circles fall
  on top of each other and neither the numbers nor the path can be read — in the
  tool's main use case. Below the threshold they shrink to dots and the number
  goes; zooming in brings it back. The selected one never shrinks.
- **Where you were survives a reload.** Reloading used to drop you back at the
  project list, which in a project with several campaigns means choosing twice
  every time.

- **Optional accounts, one person's projects per account.** Storage now sits
  behind one interface with two implementations. IndexedDB stays the default and
  needs no configuration; Firestore with per-account isolation switches on when
  the Firebase environment variables are present. The published site can use the second
  so projects outlive a browser profile, while a clone of this repository still
  runs on `npm install && npm run dev` alone.
- **Sign-in by e-mail link.** No password to choose, recover, or store. What is
  proven is access to the mailbox, which is what a password reset proves anyway.
- **Server-side rules, not client-side filtering.** Nothing in the client
  checks who owns what. Everything belonging to a person lives under their own
  uid, which makes the rule three lines instead of an ownership field to check
  on every document. The keys the browser carries are readable by anyone who
  opens the developer tools, so a check in the client would be decoration.
  Setup in [docs/contas.md](docs/contas.md).
- **Projects already on the machine are offered up, not stranded.** On first
  sign-in the app notices them and offers to copy them into the account, through
  the same validated path as a JSON import. Nothing is deleted locally.

### Fixed

- **The parcel boundary never drew in the camera view**, because its source and
  layers were never created. The effect that writes the data existed and called
  `setData` on a source that did not exist: `getSource` returned undefined, the
  optional chain swallowed the call, and nothing reported that the drawing was
  not happening.
- **The amber footprint on the ground appeared some of the time**, and the
  camera cone ran off the map. The footprint and the 3D pyramid each had their
  own calculation, and the ground one required three corners resting on terrain
  — with the gimbal at twelve or thirteen degrees the upper rays pass above the
  horizon. The cone is now a fixed size that reads the same every time; the
  footprint on the ground is what still carries the true measurement, drawn
  faintly when its corners did not all reach the ground.
- **Dragging in the camera view now turns the aircraft.** It used to turn the
  gimbal on both axes, and the gimbal is limited to a quarter turn each way — so
  past that, dragging sideways did nothing and the aircraft was never seen to
  turn on the map. The model rotated all along; only Q and E could show it.
- **The first-person view froze whenever the gimbal pointed above the horizon.**
  A map camera cannot look up, and with no terrain intersection there was no
  point to aim at: the view stayed where it last was and only the altitude
  moved. The ray is now lowered the minimum needed, so the view keeps turning
  with the gimbal.
- **The aircraft's heading could not be read.** A quadcopter seen from above is
  nearly symmetric under quarter turns, and the only cue was the gimbal camera,
  two pixels wide at map scale. Front propeller tips are now warm and rear ones
  cold — what the aircraft themselves do with their arm LEDs — and a separate
  heading arrow says where the nose points.
- **Warnings and file errors were missing their accents**, in an interface that
  is meant to be in correct European Portuguese throughout.
- **The published address in the repository was dead.** The Vercel project had
  followed the rename; the repository homepage had not.

### Changed

- **Virtual flight no longer rebuilds everything each frame.** Ray marching
  against terrain ran sixty times a second — with the gimbal near horizontal
  that is a three-kilometre reach, hundreds of samples per ray — and the frustum
  edges shared a vertex buffer with the route, so moving the aircraft rebuilt
  every vertical, leg, chevron and ground mark. Both are fixed, and the
  application stops dragging.
- **The build stamp is shown in the corner of the map.** Without it there is no
  way to tell a new version from a page the browser kept — which cost an
  afternoon of arguing about fixes that were in the bundle all along.

---

## 0.1.0 — first public release

### Added

- **Eight enterprise aircraft** — Mavic 3E/3M, Matrice 30/30T, 3D/3TD, 300 RTK,
  350 RTK — with the enum values from DJI's published Cloud API documentation.
  The Mavic 3T acted as the cross-check: the values read out of a real file
  matched the documentation exactly.
- **Virtual flight now shows the aircraft**, its heading, both gimbal angles,
  and the camera frustum as a 3D inverted pyramid rising from the terrain to the
  aircraft. The camera view also draws the imported parcel boundary.
- **Direction of travel on every leg** — a chevron at the midpoint, in the leg's
  own colour, lying in the plane of the climb. On a coverage route with parallel
  legs, the order could only be read point by point off the marker numbers.
- **The take-off point is drawn**, with the outbound and return legs dashed. The
  route used to start in mid-air. The return leg is only drawn when the route
  actually has one: with `autoLand` or `noAction` it would be showing a flight
  that is not going to happen.
- **Side panels shrink themselves** on a narrow window so the map keeps usable
  width. The stored preference is untouched and comes back when the window grows.
- **Terrain relief is on by default.** In plan view, a route grazing a ridge and
  one clearing it by a hundred metres are drawn the same.
- **Route speed in the replay is chosen on a slider, up to 50×** — a half-hour
  coverage reviews in thirty-six seconds.
- **Static hosting configuration** and a guide covering the three things that
  surprise people: routes do not travel with you, a deploy is public by default,
  and a catch-all rewrite hides missing files.
- **End-to-end tests** of the critical path, running against a production build.
- **Coverage measurement** and a linter that understands React hooks.

### Fixed

- **Rotating in virtual flight moved nothing on screen.** The map turned to keep
  the heading up while the 3D model turned with the heading in world
  coordinates: equal angles, opposite directions, net zero. What you saw was the
  terrain spinning around an apparently frozen aircraft. The map now follows the
  position only, and the view's orientation belongs to whoever is looking.
- **The MapLibre worker was dead in production builds.** It was bundled in a way
  that did not carry its own dependency, so the file it imported was served as
  HTML and the worker died on load, without an exception. No terrain relief, no
  hillshade, no GeoJSON — while the orthophoto kept loading, so the map looked
  fine with perfectly flat ground in mountain country. The build now fails if
  any bundled import is unresolved.
- **A deleted route could come back.** The debounced save closed over the route
  rather than reading what was pending, so discarding a pending save did nothing
  and the deleted route was written again 400 ms later.
- **Negative values could not be typed** into action parameters. A lone minus
  sign is not a number, so it was discarded and the field snapped back — on a
  gimbal pitch field ranging −90 to 45, where negative is the normal case.
- **Accents were stripped from exported filenames.** JavaScript's `\w` is
  ASCII-only, so without Unicode normalisation an accented letter was deleted
  rather than simplified.
- Missing accents in four pieces of visible text, with a test to catch the next.
- Selection tint covered the aircraft model instead of marking it.

### Changed

- **The bundle is no longer one file.** Application code dropped from 1736 kB to
  620 kB; MapLibre is cached separately and no longer re-downloaded after every
  change. The zip library and the DXF reader load only when used.
- **The aircraft model is lighter and more accurate** — 1500 triangles, down
  from 3940, with proportions and colours corrected against reference
  photographs. Original geometry, no bundled third-party model, no markings.

---

## Earlier work

### The exporters

- Generators and readers for **both KMZ dialects** — DJI Fly
  (`uav.com/wpmz/1.0.2`) and DJI Pilot 2 (`dji.com/wpmz/1.0.6`).
- The Fly generator reproduces a real mission file tag for tag.
- Re-exporting an imported KMZ returns a byte-identical file.
- KML export for Google Earth.

### Planning

- **Survey coverage generated from an imported parcel boundary**, with spacing
  derived from the camera and altitude rather than chosen by hand. Concave
  parcels produce split passes so the aircraft does not cross what it should not.
- **Battery splitting** into the flights a route actually is, each with its own
  transit out and return.
- Repeat a leg offset sideways, or retrace it in the opposite direction.
- Points of interest, batch editing, per-waypoint actions.
- Multiple routes per project; projects exportable as JSON.

### Terrain

- 2D and 3D map with real elevation, hillshade, and AGL altitudes.
- Terrain profile showing clearance along the whole route.
- DXF topography import in ETRS89 / PT-TM06, taking precedence over public tiles
  inside the area it covers.
- Route colour indicates ground clearance; validation against the service
  ceiling, minimum clearance, endurance, and unsupported actions.

### Flying it before flying it

- **Virtual flight** — pilot over the map, record waypoints with the attitude
  framed.
- **Replay** — walk the route in time, with the aircraft shown on the map and on
  the terrain profile.
- **Camera view** — what the lens would see from a given point and attitude.
- Measurement ruler for distances and areas without touching the route.

### Notable fixes along the way

- A production-only blank map, caused by subscribing to the style event after
  applying the style.
- Dragging the map seeded waypoints; clicking now only creates them with the
  mode on.
- Waypoint heading read a field left unset by the default heading mode, so every
  aircraft pointed north and the camera preview was wrong.
- A hand-drawn perimeter closing within a few metres was refused as open.
- The map redrew entirely on every mouse move, costing more than half the frame
  budget.
