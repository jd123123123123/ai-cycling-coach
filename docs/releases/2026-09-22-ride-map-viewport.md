# Ride map and viewport correction — 22 September 2026

Base: d26aec9841b918d8e68f1ec1a43650ed1e851d45, live Railway deployment 6ce13931-bf0e-4587-8370-e0b49824c788.

User requested the missing geographic basemap behind the GPS route, full-width elevation, and no vertical movement or black overscroll area in ride detail. Existing ride-only release authorization and explicit reserve-mode review waiver apply. No synthetic reviewer panel is claimed.

## Changes
- Reuse the existing lazy MapLibre/Maptoolkit map with W3 colours, real GPS and visible clickable attribution. Preserve the route silhouette until the map is painted. Tapping the map opens the existing full-screen map.
- Elevation spans the full ride width, uses a measured responsive coordinate system, retains its recorded distance/height axes and gaps, and opens the altitude analysis.
- Anchor ride detail to the dynamic viewport and stop vertical overscroll. Apply the bottom safe area once, through navigation. Document scroll containment exists only while the live ride detail is mounted. Explanations retain their separate detail interaction.
- Changes are confined to atelier ride components/styles plus an opt-in resize fit in RouteMap. Only the atelier opts in, so late-arriving analysis cannot crop the route. Today, shared design tokens, full-screen map behavior and backend are unchanged.

## Verification
- TypeScript / production build passed; existing MapLibre chunk size advisory remains.
- 21 focused frontend tests passed, including missing altitude gaps, height analysis interaction and recorded ride comparisons.
- 56 rendered route/panel checks at 375×667, 390×844, 430×932 and 1266×712: no content overflow, no document/panel movement after wheel input, no browser exceptions. 390/430-width scenarios additionally simulate 59px top and 34px bottom iPhone safe areas. These are browser tests, not a physical iPhone test.
- All four sizes loaded real map tiles; map and elevation widths exactly match the ride viewport (375/390/430/480px). Attribution is present. Missing-data scenario remains honest.
- Live inspection of ride 307 exposed a camera-fit issue when late data changes map height; the opt-in resize handler re-fits the complete recorded route without reloading the map.
- Deployment uses the clean committed archive and the existing CLI-only Railway target, per the preceding ride release. Verify success, health and the affected live route after publishing.
