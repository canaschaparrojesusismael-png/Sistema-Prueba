const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.resetUserPassword = functions.onCall(async (data, context) => {
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

  // 🛡️ Evitar que se reseteen contraseñas de otros Owner Supremos
  const targetDoc = await admin.firestore().collection("usuarios").doc(targetUid).get();
  if (targetDoc.exists && targetDoc.data().rango === "owner_supremo" && targetUid !== callerUid) {
    throw new functions.https.HttpsError("permission-denied", "No puedes resetear la contraseña de otro Owner Supremo.");
  }

  // Actualizar la contraseña en Authentication
  await admin.auth().updateUser(targetUid, { password: newPassword });

  // Forzar cambio de contraseña en el siguiente inicio de sesión
  await admin.firestore().collection("usuarios").doc(targetUid).update({
    requiresPasswordChange: true,
  });

  return { success: true };
});

  return { success: true };
});
