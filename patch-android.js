// Ergänzt Berechtigungen im Manifest und (falls vorhanden) die feste Signatur (idempotent).
const fs = require('fs');

const mp = 'android/app/src/main/AndroidManifest.xml';
let x = fs.readFileSync(mp, 'utf8');
const perms = [
  'android.permission.INTERNET',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.RECEIVE_BOOT_COMPLETED'
];
for (const q of perms) {
  if (!x.includes(q)) x = x.replace('<application', `<uses-permission android:name="${q}" />\n    <application`);
}
fs.writeFileSync(mp, x);
console.log('Manifest gepatcht:', perms.filter(q => x.includes(q)).length + '/' + perms.length);

// Feste Signatur: gleiche APK-Signatur bei jedem Build => Update über die installierte App ohne Datenverlust
const gp = 'android/app/build.gradle';
if (fs.existsSync('familienplaner.keystore')) {
  let g = fs.readFileSync(gp, 'utf8');
  if (!g.includes('familienplaner.keystore')) {
    g += `
android {
    signingConfigs {
        debug {
            storeFile file('../../familienplaner.keystore')
            storePassword 'android'
            keyAlias 'familienplaner'
            keyPassword 'android'
        }
    }
}
`;
    fs.writeFileSync(gp, g);
  }
  console.log('Feste Signatur aktiv');
} else {
  console.log('Keine familienplaner.keystore gefunden - Standard-Signatur (Updates erfordern Deinstallation)');
}
