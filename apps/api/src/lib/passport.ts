import passport from "passport"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import { env } from "../config/env"
import { prisma } from "./prisma"
import type { Prisma } from "../../generated/prisma"

const base = env.API_BASE_URL ?? `http://localhost:${env.PORT}`
const GOOGLE_CALLBACK_URL = `${base}/api/auth/google/callback`

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value
        if (!email) {
          return done(new Error("Google account has no email address"))
        }

        // Upsert user and link OAuthAccount in one transaction
        const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          let user = await tx.user.findUnique({ where: { email } })

          if (!user) {
            user = await tx.user.create({
              data: {
                email,
                name: profile.displayName ?? null,
                avatarUrl: profile.photos?.[0]?.value ?? null,
              },
            })
          } else if (!user.avatarUrl && profile.photos?.[0]?.value) {
            // Backfill avatar on first OAuth login for existing email-only users
            user = await tx.user.update({
              where: { id: user.id },
              data: { avatarUrl: profile.photos[0].value },
            })
          }

          await tx.oAuthAccount.upsert({
            where: {
              provider_providerAccountId: {
                provider: "google",
                providerAccountId: profile.id,
              },
            },
            create: {
              userId: user.id,
              provider: "google",
              providerAccountId: profile.id,
            },
            update: {},
          })

          return user
        })

        return done(null, user)
      } catch (err) {
        return done(err as Error)
      }
    }
  )
)

export default passport
