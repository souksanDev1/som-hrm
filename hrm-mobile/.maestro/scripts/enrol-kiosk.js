// Maestro runScript (GraalJS): HR turns on KIOSK mode at the seeded site branch "ໜ້າງານ ປາກເຊ" (where E003 works)
// and enrols a kiosk tablet through the API, exactly as the web /settings/kiosks page does (FR-ATT-03.1).
// Env: API_URL (default http://localhost:4000/api/v1). Output: output.enrolCode (shown once by the API).
var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:4000/api/v1';
var json = { 'Content-Type': 'application/json' };

var login = http.post(api + '/auth/login', {
  headers: json,
  body: JSON.stringify({ workspaceCode: 'som-demo', identifier: 'admin@som.la', password: 'Admin1234' }),
});
var auth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + JSON.parse(login.body).accessToken };

var branches = JSON.parse(http.get(api + '/branches', { headers: auth }).body);
var site = branches.filter(function (b) { return b.name === 'ໜ້າງານ ປາກເຊ'; })[0];
if (site.attendanceModes.indexOf('KIOSK') < 0) {
  http.patch(api + '/branches/' + site.id, { headers: auth, body: JSON.stringify({ attendanceModes: site.attendanceModes.concat(['KIOSK']) }) });
}

var enrolled = http.post(api + '/kiosks', {
  headers: auth,
  body: JSON.stringify({ branchId: site.id, name: 'Maestro ' + String(new Date().getTime()).slice(-6) }),
});
output.enrolCode = JSON.parse(enrolled.body).enrolCode;
