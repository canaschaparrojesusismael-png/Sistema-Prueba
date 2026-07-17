const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Inicialización de la app admin. Solo debe llamarse una vez.
admin.initializeApp();

// ============================================================================
// FUNCIÓN 1: RESETEO DE CONTRASEÑA (Corregida y asegurada)
// ============================================================================
exports.resetUserPassword = functions.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión para usar esta función.");
  }

  const callerUid = context.auth.uid;
  const { targetUid, newPassword } = data;

  if (!targetUid || !newPassword) {
    throw new functions.https.HttpsError("invalid-argument", "Se requiere targetUid y newPassword.");
  }

  // 1. Verificar que quien llama es Owner Supremo
  const callerDoc = await admin.firestore().collection("usuarios").doc(callerUid).get();
  if (!callerDoc.exists || callerDoc.data().rango !== "owner_supremo") {
    throw new functions.https.HttpsError("permission-denied", "Únicamente el Owner Supremo puede resetear contraseñas.");
  }

  // 2. 🛡️ Evitar que se reseteen contraseñas de otros Owner Supremos
  const targetDoc = await admin.firestore().collection("usuarios").doc(targetUid).get();
  if (targetDoc.exists && targetDoc.data().rango === "owner_supremo" && targetUid !== callerUid) {
    throw new functions.https.HttpsError("permission-denied", "No puedes resetear la contraseña de otro Owner Supremo.");
  }

  // 3. Actualizar la contraseña en Firebase Authentication
  await admin.auth().updateUser(targetUid, { password: newPassword });

  // 4. Forzar cambio de contraseña en el siguiente inicio de sesión
  await admin.firestore().collection("usuarios").doc(targetUid).update({
    requiresPasswordChange: true,
  });

  return { success: true };
});

// ============================================================================
// FUNCIÓN 2: MIGRACIÓN TEMPORAL HTTP (Para ejecutar una sola vez)
// ============================================================================
exports.migracionCuentasActivas = functions.https.onRequest(async (req, res) => {
  try {
    const usersRef = admin.firestore().collection("usuarios");
    const snapshot = await usersRef.get();
    
    // Usamos batch para operaciones masivas (límite de 500 por batch en Firestore)
    const batch = admin.firestore().batch();
    let contador = 0;

    snapshot.docs.forEach(doc => {
      // Solo actualizamos si el campo no existe
      if (doc.data().cuentaActiva === undefined) {
        batch.update(doc.ref, { cuentaActiva: true });
        contador++;
      }
    });

    if (contador > 0) {
      await batch.commit();
      res.status(200).send(`Migración completada. Se actualizaron ${contador} usuarios añadiendo cuentaActiva: true.`);
    } else {
      res.status(200).send("No hubo usuarios que actualizar. Todos tienen el campo definido.");
    }
    
  } catch (error) {
    console.error("Error en la migración:", error);
    res.status(500).send("Ocurrió un error durante la migración: " + error.message);
  }
});
