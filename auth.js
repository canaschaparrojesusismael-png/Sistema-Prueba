(function () {
  "use strict";
  const STORAGE_KEY = "sistemaOrquestas_session";
  const MOCK_USERS = [
    { id: 101, username: "estudiante1", password: "123456", role: "Estudiante", firstName: "Luis", lastName: "Fernández", age: 16, group: "Orquesta Infantil", state: "Táchira", nucleus: "CMA María Auxiliadora", permissions: ["view_profile"] },
    { id: 102, username: "profesor1", password: "123456", role: "Profesor", firstName: "María", lastName: "González", age: 34, group: "Orquesta Juvenil", state: "Mérida", nucleus: "Núcleo Principal", permissions: ["view_profile", "access_panel"] },
    { id: 103, username: "admin1", password: "123456", role: "Administrativo", firstName: "Carlos", lastName: "Rodríguez", age: 45, group: "Dirección General", state: "Zulia", nucleus: "Centro de Gestión", permissions: ["view_profile", "access_panel", "edit_carousel"] }
  ];

  function getStorage(remember) { return remember ? localStorage : sessionStorage; }
  function getSession() {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) { try { return JSON.parse(local); } catch (e) {} }
    const session = sessionStorage.getItem(STORAGE_KEY);
    if (session) { try { return JSON.parse(session); } catch (e) {} }
    return null;
  }
  function saveSession(session, remember) { getStorage(remember).setItem(STORAGE_KEY, JSON.stringify(session)); }
  function mockLogin(username, password, remember) {
    const user = MOCK_USERS.find(u => u.username === username && u.password === password);
    if (!user) return false;
    const session = {
      id: user.id, username: user.username, role: user.role, firstName: user.firstName, lastName: user.lastName,
      age: user.age, group: user.group, state: user.state, nucleus: user.nucleus, permissions: user.permissions,
      data: {}, loginTime: Date.now()
    };
    saveSession(session, remember);
    return true;
  }

  window.Auth = {
    login: (u, p, remember) => mockLogin(u, p, !!remember),
    logout: () => {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      window.location.href = "index.html";
    },
    getSession: () => getSession(),
    hasPermission: (p) => { const s = getSession(); return s ? s.permissions.includes(p) : false; },
    getRole: () => { const s = getSession(); return s ? s.role : null; }
  };
})();