/**
 * W3 · Loading — the app's branded wait state, so a data screen never shows a
 * blank frame. A softly pulsing acid ring behind the W3 mark, over the same
 * dark ground as every screen.
 *
 * The implementation moved to `components/AppLoading.tsx` and this is now a
 * re-export, because the SAME component is also the <Suspense> fallback and the
 * <ProtectedRoute> gate — both of which live outside editorial/ and therefore
 * may not import from it (`editorial/__tests__/isolation.test.ts`). Moving it
 * out is what makes "one loader, app-wide" literally true rather than two
 * lookalikes that drift; the W3 screens keep importing it under its own name.
 *
 * Props are unchanged: `<W3Loading label="Lade deine Fahrt…" />`.
 */
export { default } from '../../components/AppLoading'
