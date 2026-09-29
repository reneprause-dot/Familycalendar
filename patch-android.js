// Ergänzt die nötigen Berechtigungen im generierten Android-Manifest (idempotent).
const fs = require('fs');
const p = 'android/app/src/main/AndroidManifest.xml';
let x = fs.readFileSync(p, 'utf8');
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
fs.writeFileSync(p, x);
console.log('Manifest gepatcht:', perms.filter(q => x.includes(q)).length + '/' + perms.length);
