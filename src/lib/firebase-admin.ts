import type { App as AdminApp } from "firebase-admin/app"
import { getApps as getAdminApps, initializeApp as initializeAdminApp, cert } from "firebase-admin/app"
import { getAuth as getAdminAuth, type Auth as AdminAuth } from "firebase-admin/auth"

let adminApp: AdminApp | null = null
let adminAuth: AdminAuth | null = null

function getPrivateKey() {
  let key = process.env.ADMIN_PRIVATE_KEY
  if (!key) return undefined

  // Strip surrounding quotes if present
  if (key.startsWith('"') && key.endsWith('"')) {
    key = key.slice(1, -1)
  }

  // Convert literal \n into real newlines
  return key.replace(/\\n/g, '\n')
}

export function getFirebaseAdminApp(): AdminApp {
  if (adminApp) return adminApp

  const projectId = process.env.ADMIN_PROJECT_ID
  const clientEmail = process.env.ADMIN_CLIENT_EMAIL
  const privateKey = getPrivateKey()

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin env vars. Set ADMIN_PROJECT_ID, ADMIN_CLIENT_EMAIL, ADMIN_PRIVATE_KEY in Project Settings.",
    )
  }

  adminApp =
    getAdminApps().length > 0
      ? (getAdminApps()[0] as AdminApp)
      : initializeAdminApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        })

  return adminApp
}

export function getFirebaseAdminAuth(): AdminAuth {
  if (adminAuth) return adminAuth
  adminAuth = getAdminAuth(getFirebaseAdminApp())
  return adminAuth
}
