import { initializeApp, getApps, cert, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

let adminApp: App

if (getApps().length === 0) {
  adminApp = initializeApp({
    credential: cert({
      projectId: process.env.ADMIN_PROJECT_ID,
      clientEmail: process.env.ADMIN_CLIENT_EMAIL,
      privateKey: process.env.ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  })
} else {
  adminApp = getApps()[0]
}

const adminDb = getFirestore(adminApp)

export { adminApp, adminDb }
