"use client"

import { initializeApp, getApps, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"

let app: FirebaseApp | null = null
let authInstance: Auth | null = null

export function getFirebaseApp(): FirebaseApp {
  if (app) return app

  const config = {
    apiKey: process.env.NEXT_PUBLIC_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_ADMIN_PROJECT_ID!,
    storageBucket: process.env.NEXT_PUBLIC_STORAGE_BUCKET!,
    messagingSenderId: process.env.NEXT_PUBLIC_MESSAGING_SENDER_ID!,
    appId: process.env.NEXT_PUBLIC_APP_ID!,
  }

  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    console.warn("[v0] Missing Firebase client env vars. Set NEXT_PUBLIC_* in Project Settings.")
  }

  app = getApps().length ? getApps()[0]! : initializeApp(config)
  return app
}

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance
  const app = getFirebaseApp()
  authInstance = getAuth(app)
  return authInstance
}
