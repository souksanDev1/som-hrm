// Maestro runScript (GraalJS): HR issues a temporary PIN to a fresh employee through the API,
// exactly as the web "create login" action does. The employee has no phone, so the SMS
// verification step does not apply and the forced PIN change is the only setup step.
// Env: API_URL (default http://localhost:4000/api/v1). Outputs: output.employeeCode, output.tempPin.
var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:4000/api/v1';
var json = { 'Content-Type': 'application/json' };

var login = http.post(api + '/auth/login', {
  headers: json,
  body: JSON.stringify({ workspaceCode: 'som-demo', identifier: 'admin@som.la', password: 'Admin1234' }),
});
var token = JSON.parse(login.body).accessToken;

// Every employee needs a department and a line manager (or the top-level flag): use the seeded department.
var departments = JSON.parse(http.get(api + '/departments', { headers: { Authorization: 'Bearer ' + token } }).body);
var departmentId = '';
for (var i = 0; i < departments.length; i++) {
  if (departments[i].name === 'ປະຕິບັດການ') departmentId = departments[i].id;
}

var code = 'M' + String(new Date().getTime()).slice(-7);
var created = http.post(api + '/employees', {
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify({
    employeeCode: code, firstName: 'ທົດສອບ', lastName: 'Maestro', gender: 'MALE',
    hireDate: '2025-01-01', contractType: 'INDEFINITE', payType: 'DAILY', departmentId: departmentId, isTopLevel: true, login: { method: 'PIN' },
  }),
});
output.employeeCode = code;
output.tempPin = JSON.parse(created.body).credential.temporarySecret;
