const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// ==================== RESETEO DE CONTRASEÑA ====================
exports.resetUserPassword = functions.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión.");
  const callerUid = context.auth.uid;
  const { targetUid, newPassword } = data;
  if (!targetUid || !newPassword) throw new functions.https.HttpsError("invalid-argument", "Se requiere targetUid y newPassword.");

  const callerDoc = await admin.firestore().collection("usuarios").doc(callerUid).get();
  if (!callerDoc.exists || callerDoc.data().rango !== "owner_supremo") {
    throw new functions.https.HttpsError("permission-denied", "Únicamente el Owner Supremo puede resetear contraseñas.");
  }

  const targetDoc = await admin.firestore().collection("usuarios").doc(targetUid).get();
  if (targetDoc.exists && targetDoc.data().rango === "owner_supremo" && targetUid !== callerUid) {
    throw new functions.https.HttpsError("permission-denied", "No puedes resetear la contraseña de otro Owner Supremo.");
  }

  await admin.auth().updateUser(targetUid, { password: newPassword });
  await admin.firestore().collection("usuarios").doc(targetUid).update({ requiresPasswordChange: true });
  return { success: true };
});

// ==================== SINCRONIZAR RANGO EN CUSTOM CLAIMS ====================
exports.sincronizarRangoEnAuth = functions.firestore
  .document("usuarios/{userId}")
  .onWrite(async (change, context) => {
    const userId = context.params.userId;
    const after = change.after.exists ? change.after.data() : null;
    if (!after) {
      return admin.auth().setCustomUserClaims(userId, null);
    }
    const before = change.before.exists ? change.before.data() : null;
    if (before && before.rango === after.rango) return null;
    const rango = after.rango;
    return admin.auth().setCustomUserClaims(userId, { rango });
  });

// ==================== CREACIÓN SEGURA DE USUARIOS (desde el frontend) ====================
exports.crearUsuario = functions.onCall(async (data, context) => {
  // Solo usuarios autenticados
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión.");

  const callerUid = context.auth.uid;
  const { email, password, nombre, rango, agrupacion, estado, nucleo, edad } = data;

  // Validar campos obligatorios
  if (!email || !password || !nombre || !rango) {
    throw new functions.https.HttpsError("invalid-argument", "Faltan campos obligatorios.");
  }

  // Obtener datos del solicitante
  const callerDoc = await admin.firestore().collection("usuarios").doc(callerUid).get();
  if (!callerDoc.exists) throw new functions.https.HttpsError("not-found", "Solicitante no encontrado.");
  const callerRango = callerDoc.data().rango;
  const callerEstado = callerDoc.data().estado;
  const callerNucleo = callerDoc.data().nucleo;

  // Jerarquía de permisos
  const JERARQUIA = {
    owner_supremo: 70,
    director_nacional: 60,
    director_regional: 50,
    director_nucleo: 40,
    admin: 30,
    profesor: 20,
    estudiante: 10
  };

  const nivelSolicitante = JERARQUIA[callerRango] || 0;
  const nivelObjetivo = JERARQUIA[rango] || 0;

  // Validar permisos
  if (nivelSolicitante <= nivelObjetivo && callerRango !== "owner_supremo") {
    throw new functions.https.HttpsError("permission-denied", "No puedes crear un usuario con un rango igual o superior al tuyo.");
  }

  // Validar ámbito geográfico
  if (callerRango === "director_regional" && estado !== callerEstado) {
    throw new functions.https.HttpsError("permission-denied", "Solo puedes crear usuarios en tu estado.");
  }
  if ((callerRango === "director_nucleo" || callerRango === "admin") && nucleo !== callerNucleo) {
    throw new functions.https.HttpsError("permission-denied", "Solo puedes crear usuarios en tu núcleo.");
  }

  // Crear usuario en Auth
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: nombre
    });
  } catch (error) {
    throw new functions.https.HttpsError("internal", "Error al crear usuario en Auth: " + error.message);
  }

  // Guardar documento en Firestore
  await admin.firestore().collection("usuarios").doc(userRecord.uid).set({
    username: email,
    nombre,
    rango,
    agrupacion: agrupacion || "",
    estado: estado || "",
    nucleo: nucleo || "",
    email,
    isOnline: false,
    currentSessionId: "",
    requiresPasswordChange: true,
    cuentaActiva: true,
    edad: edad || 0,
    fechaCreacion: new Date().toISOString()
  });

  return { success: true, uid: userRecord.uid };
});
