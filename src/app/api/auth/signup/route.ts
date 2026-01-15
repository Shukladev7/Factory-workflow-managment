import { NextResponse } from "next/server"
import { getFirebaseAdminAuth } from "@/lib/firebase-admin"

export async function POST(req: Request) {
  try {
    const { email, fullName } = await req.json()

    if (!email || !fullName) {
      return NextResponse.json({ error: "Email and full name are required." }, { status: 400 })
    }

    const adminAuth = getFirebaseAdminAuth()

    // Try to fetch user; if not found, create one
    let userRecord
    try {
      userRecord = await adminAuth.getUserByEmail(email)
      // Update displayName if different
      if (userRecord.displayName !== fullName) {
        userRecord = await adminAuth.updateUser(userRecord.uid, { displayName: fullName })
      }
    } catch (e: any) {
      // If not found, create
      if (e?.errorInfo?.code === "auth/user-not-found") {
        userRecord = await adminAuth.createUser({
          email,
          displayName: fullName,
          // no password set here; we'll send a set-password email via client
          emailVerified: false,
        })
      } else {
        throw e
        console.error("Error fetching user:", e)
        return NextResponse.json({ error: "Error fetching user." }, { status: 500 })
      }
    }

    // Optionally return a password reset link (client will still trigger Firebase to send email)
    // const link = await adminAuth.generatePasswordResetLink(email, {
    //   url: process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/login` : undefined,
    // });

    return NextResponse.json({ ok: true, uid: userRecord.uid })
  } catch (error: any) {
    const message = error?.message || "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}