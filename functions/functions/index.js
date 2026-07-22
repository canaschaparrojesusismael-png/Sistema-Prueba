const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// Se ejecuta cuando un documento de usuario es creado o actualizado
exports.sincronizarRangoEnAuth = functions.firestore
  .document("usuarios/{userId}")
  .onWrite(async (change, context) => {
    const userId = context.params.userId;
    const after = change.after.exists ? change.after.data() : null;

    // Si el documento fue borrado, eliminamos los claims
    if (!after) {
      return admin.auth().setCustomUserClaims(userId, null);
    }

    // Solo sincronizamos si el campo rango cambió
    const before = change.before.exists ? change.before.data() : null;
    if (before && before.rango === after.rango) return null;

    const rango = after.rango;
    // Asignar el claim
    return admin.auth().setCustomUserClaims(userId, { rango });
  });
