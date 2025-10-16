/**
 * scripts/create-admin-user.ts
 *
 * Server-side admin script — uses firebase-admin (NOT the client SDK)
 *
 * Usage examples:
 * 1) Preferred (set GOOGLE_APPLICATION_CREDENTIALS to a JSON file):
 *    export GOOGLE_APPLICATION_CREDENTIALS="/full/path/to/service-account.json"
 *    ADMIN_EMAIL="gouravshukla337@gmail.com" ADMIN_PASSWORD="TempPassword123!" npx tsx scripts/create-admin-user.ts
 *
 * 2) Or (set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in env):
 *    FIREBASE_PROJECT_ID="your-project-id" \
 *    FIREBASE_CLIENT_EMAIL="service-account@your-project.iam.gserviceaccount.com" \
 *    FIREBASE_PRIVATE_KEY="$(cat ./keys/sa.key | sed ':a;N;$!ba;s/\n/\\n/g')" \
 *    ADMIN_EMAIL="gouravshukla337@gmail.com" ADMIN_PASSWORD="TempPassword123!" \
 *    npx tsx scripts/create-admin-user.ts
 *
 * NOTE: Do not commit private key or service-account JSON to git.
 */

import admin from "firebase-admin";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: ".env.local" }); // load env if present

type Env = {
  // client keys (not required for admin but allowed)
  NEXT_PUBLIC_FIREBASE_API_KEY?: string;
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
  NEXT_PUBLIC_FIREBASE_APP_ID?: string;
  GEMINI_API_KEY?: string;

  // admin (required)
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  // alternate: SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS env var will be used if set

  // script params
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_UID?: string; // optional
  SERVICE_ACCOUNT_PATH?: string;
};

const env: Env = process.env as any;

function initAdmin() {
  if (admin.apps.length) return;

  // Option A: GOOGLE_APPLICATION_CREDENTIALS or SERVICE_ACCOUNT_PATH (JSON file)
  const googleCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS || env.SERVICE_ACCOUNT_PATH;
  if (googleCreds) {
    // if GOOGLE_APPLICATION_CREDENTIALS is set, firebase-admin will pick it up automatically
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && env.SERVICE_ACCOUNT_PATH) {
      const p = path.resolve(env.SERVICE_ACCOUNT_PATH!);
      if (!fs.existsSync(p)) {
        console.error("Service account file not found at:", p);
        process.exit(1);
      }
      const serviceAccount = JSON.parse(fs.readFileSync(p, "utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Initialized firebase-admin using SERVICE_ACCOUNT_PATH JSON.");
      return;
    } else {
      admin.initializeApp();
      console.log("Initialized firebase-admin using GOOGLE_APPLICATION_CREDENTIALS environment variable.");
      return;
    }
  }

  // Option B: Initialize from env vars FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    // Private key in env may have \n literal sequences — convert them to actual newlines
    const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      } as admin.ServiceAccount),
    });
    console.log("Initialized firebase-admin using FIREBASE_* environment variables.");
    return;
  }

  console.error("No admin credentials found. Set GOOGLE_APPLICATION_CREDENTIALS, SERVICE_ACCOUNT_PATH, or FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in env.");
  process.exit(1);
}

async function createOrUpdateAdmin() {
  initAdmin();

  const auth = admin.auth();
  const db = admin.firestore();

  const email = env.ADMIN_EMAIL || "gouravshukla337@gmail.com";
  const password = env.ADMIN_PASSWORD || "TempPassword123!";
  const desiredUid = env.ADMIN_UID;

  let userRecord: admin.auth.UserRecord | undefined;

  // Try to find user by UID (if provided) or by email
  try {
    if (desiredUid) {
      try {
        userRecord = await auth.getUser(desiredUid);
        console.log(`Found existing user by UID: ${desiredUid}`);
      } catch {
        // fallback to email
        try {
          userRecord = await auth.getUserByEmail(email);
          console.log(`Found existing user by email: ${email}`);
        } catch {
          userRecord = undefined;
        }
      }
    } else {
      try {
        userRecord = await auth.getUserByEmail(email);
        console.log(`Found existing user by email: ${email}`);
      } catch {
        userRecord = undefined;
      }
    }
  } catch (err) {
    console.warn("Lookup error:", err);
    userRecord = undefined;
  }

  if (!userRecord) {
    // create user
    const createParams: admin.auth.CreateRequest = {
      email,
      emailVerified: true,
      password,
      displayName: "Gourav Shukla",
      disabled: false,
    };
    if (desiredUid) createParams.uid = desiredUid;

    userRecord = await auth.createUser(createParams);
    console.log("✅ Created new auth user:", userRecord.uid);
  } else {
    // update displayName if not present (password updates can be sensitive)
    try {
      await auth.updateUser(userRecord.uid, {
        displayName: userRecord.displayName || "Gourav Shukla",
      });
      console.log("✅ Updated existing user attributes (displayName).");
    } catch (err) {
      console.warn("Could not update user attributes:", err);
    }
  }

  const uid = userRecord.uid;

  // Set custom claim role = admin
  await auth.setCustomUserClaims(uid, { role: "admin" });
  console.log("✅ Set custom claim role=admin for uid:", uid);

  // Write Firestore employees doc (server timestamp)
  const employeeDoc = {
    uid,
    name: userRecord.displayName || "Gourav Shukla",
    email: userRecord.email,
    role: "admin",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection("employees").doc(uid).set(employeeDoc, { merge: true });
  console.log(`✅ Wrote employees/${uid} in Firestore.`);

  console.log("\nDone. Note: the user must sign out and sign in again (client) to receive updated custom claims token.");
  console.log("Admin UID:", uid);
}

createOrUpdateAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error creating/updating admin user:", err);
    process.exit(1);
  });
