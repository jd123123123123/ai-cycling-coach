# RIDR iOS App

This is a separate App Store target. It does not replace the existing React/Railway app.

The web app is built into the Capacitor shell so the product keeps the same backend, auth flows and W3 visual system while gaining an iOS distribution target. The native project lives in `ios/` and uses bundle id `com.ridr.cyclingcoach`.

## Build the iOS target

From this directory:

```bash
npm install
npm run build:ios
npm run open
```

`build:web` uses the production API URL explicitly because a bundled Capacitor WebView is not same-origin with Railway. The existing frontend build and deployment commands are unchanged.

## App Store setup still required

1. Open `ios/App/App.xcworkspace` in Xcode.
2. Select the `App` target and set the Apple Developer Team and signing certificate.
3. Add the final App Store privacy strings and capabilities (location, HealthKit, notifications) only when those native features are enabled.
4. Set the production version/build number, archive, validate and upload through Xcode Organizer.

The iOS development skill's signing guidance applies here: free Apple IDs can run from Xcode for development, while App Store distribution requires a paid Apple Developer account and signing profile.
