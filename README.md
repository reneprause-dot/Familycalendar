# Familienplaner (Android)

Kalenderbasierter Familienplaner mit Wetter, Push-Erinnerungen und Aufgabenliste.

## Funktionen
- Monatskalender, Agenda (30 Tage), Termine mit Familienmitglied, Wiederholung und Erinnerung
- Wetter für den Standort (GPS oder fester Ort, Open-Meteo, kein API-Key nötig)
- Lokale Benachrichtigungen für Termine und fällige Aufgaben
- Aufgaben-/Einkaufsliste
- Daten im internen App-Speicher des Geräts (`familienplaner.json`), Sicherung/Wiederherstellung über „Mehr“

## APK erzeugen (ohne lokales Android-SDK)
1. Neues GitHub-Repository anlegen und den **Inhalt dieses Ordners** hochladen (Branch `main`).
2. Reiter **Actions** → „APK bauen“ (startet automatisch beim Push, oder „Run workflow“).
3. Nach ca. 5–8 Minuten unter **Artifacts** → `familienplaner-apk` herunterladen, entpacken.
4. `app-debug.apk` aufs Handy kopieren und installieren („Installation aus unbekannten Quellen“ erlauben).

## Lokal bauen (Android Studio vorhanden)
```
npm install
npx cap add android
node scripts/patch-android.js
npx cap sync android
cd android && ./gradlew assembleDebug
```
APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## Tests
`npm test` prüft Wiederholungs- und Erinnerungslogik sowie das Rendern aller Ansichten.
