const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// Función existente: resetear contraseña
exports.resetUserPassword = functions.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión.");
  const callerUid = context.auth.uid;
  const { targetUid, newPassword } = data;
  if (!targetUid || !newPassword) throw new functions.https.HttpsError("invalid-argument", "Se requiere targetUid y newPassword.");

  const callerDoc = await admin.firestore().collection("usuarios").doc(callerUid).get();
  if (!callerDoc.exists || callerDoc.data().rango !== "owner_supremo") {
    throw new functions.https.HttpsError("permission-denied", "Únicamente el Owner Supremo puede resetear contraseñas.");
  }

  // Evitar que se reseteen contraseñas de otros Owner Supremos
  const targetDoc = await admin.firestore().collection("usuarios").doc(targetUid).get();
  if (targetDoc.exists && targetDoc.data().rango === "owner_supremo" && targetUid !== callerUid) {
    throw new functions.https.HttpsError("permission-denied", "No puedes resetear la contraseña de otro Owner Supremo.");
  }

  await admin.auth().updateUser(targetUid, { password: newPassword });
  await admin.firestore().collection("usuarios").doc(targetUid).update({ requiresPasswordChange: true });
  return { success: true };
});

// Nueva función: sincronizar el rango como Custom Claim
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
