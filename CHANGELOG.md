# Changelog

Nothing here has been flown yet. See
[what to verify in the field](docs/verificar-no-campo.md).

Dates are omitted on purpose: the project was built in a short burst and the
ordering below is the useful part, not the calendar.

---

## Unreleased

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
