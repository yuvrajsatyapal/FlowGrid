// Global Express type augmentation — picked up automatically by TypeScript.
// Express.User is the minimal shape shared by:
//   - Passport (Prisma User has id + email)
//   - validateJWT (reconstructs { id, email } from JWT payload)
// Downstream protected routes use req.user.id for authorization.
declare namespace Express {
  interface User {
    id: string
    email: string
  }
}
