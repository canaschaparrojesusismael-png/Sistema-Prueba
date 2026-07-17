const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

/**
 * Cloud Function que permite al Owner Supremo resetear la contraseña de cualquier usuario.
 * - Actualiza la contraseña en Firebase Auth.
 * - Establece requiresPasswordChange = true en Firestore para forzar el cambio en el próximo inicio de sesión.
 * - Verifica que el solicitante tenga rango "owner_supremo".
 */
exports.resetUserPassword = functions.onCall(async (data, context) => {
  // Verificar que el usuario está autenticado
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión para usar esta función.");
  }

  const callerUid = context.auth.uid;
  const { targetUid, newPassword } = data;

  if (!targetUid || !newPassword) {
    throw new functions.https.HttpsError("invalid-argument", "Se requiere targetUid y newPassword.");
  }

  // Solo el Owner Supremo puede ejecutar esta acción
  const callerDoc = await admin.firestore().collection("usuarios").doc(callerUid).get();
  if (!callerDoc.exists || callerDoc.data().rango !== "owner_supremo") {
    throw new functions.https.HttpsError("permission-denied", "Únicamente el Owner Supremo puede resetear contraseñas.");
  }

  // Actualizar la contraseña en Authentication
  await admin.auth().updateUser(targetUid, { password: newPassword });

  // Forzar cambio de contraseña en el siguiente inicio de sesión
  await admin.firestore().collection("usuarios").doc(targetUid).update({
    requiresPasswordChange: true,
  });

  return { success: true };
});
