import { PrismaClient } from "../generated/prisma"

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding database...")

  // Delete in reverse-dependency order (children before parents).
  // Organization must be deleted before its ownerId User — ON DELETE RESTRICT on Organization.ownerId.
  await prisma.activity.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.attachment.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.cardLabel.deleteMany()
  await prisma.card.deleteMany()
  await prisma.label.deleteMany()
  await prisma.list.deleteMany()
  await prisma.boardMember.deleteMany()
  await prisma.board.deleteMany()
  await prisma.workspaceMember.deleteMany()
  await prisma.workspace.deleteMany()
  await prisma.organizationMember.deleteMany()
  await prisma.organization.deleteMany()
  await prisma.oAuthAccount.deleteMany()
  await prisma.user.deleteMany()

  // User
  const user = await prisma.user.create({
    data: {
      email: "dev@flowgrid.local",
      name: "Dev User",
      avatarUrl: null,
    },
  })

  // Organization
  const org = await prisma.organization.create({
    data: {
      name: "FlowGrid Dev",
      slug: "flowgrid-dev",
      ownerId: user.id,
    },
  })

  await prisma.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      role: "OWNER",
    },
  })

  // Workspace
  const workspace = await prisma.workspace.create({
    data: {
      organizationId: org.id,
      name: "Engineering",
      slug: "engineering",
      description: "Main engineering workspace",
    },
  })

  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role: "OWNER",
    },
  })

  // Board
  const board = await prisma.board.create({
    data: {
      workspaceId: workspace.id,
      name: "Sprint Board",
      description: "Current sprint tasks",
      visibility: "WORKSPACE",
      coverColor: "#0ea5e9",
    },
  })

  // Labels
  const [bugLabel, featureLabel, urgentLabel] = await Promise.all([
    prisma.label.create({ data: { boardId: board.id, name: "Bug", color: "#ef4444" } }),
    prisma.label.create({ data: { boardId: board.id, name: "Feature", color: "#22c55e" } }),
    prisma.label.create({ data: { boardId: board.id, name: "Urgent", color: "#f97316" } }),
  ])

  // Lists (LexoRank-style string positions)
  const [todoList, inProgressList, doneList] = await Promise.all([
    prisma.list.create({ data: { boardId: board.id, name: "To Do", position: "a" } }),
    prisma.list.create({ data: { boardId: board.id, name: "In Progress", position: "m" } }),
    prisma.list.create({ data: { boardId: board.id, name: "Done", position: "z" } }),
  ])

  // Cards in To Do
  const card1 = await prisma.card.create({
    data: {
      listId: todoList.id,
      title: "Set up Google OAuth",
      description: "Implement Google OAuth 2.0 login flow via Passport.js",
      position: "a",
      priority: "HIGH",
      assigneeId: user.id,
    },
  })

  const card2 = await prisma.card.create({
    data: {
      listId: todoList.id,
      title: "Design onboarding flow",
      description: "Create wireframes for the user onboarding experience",
      position: "m",
      priority: "MEDIUM",
    },
  })

  // Cards in In Progress
  const card3 = await prisma.card.create({
    data: {
      listId: inProgressList.id,
      title: "Implement database schema",
      description: "Add all Prisma models and run first migration",
      position: "a",
      priority: "URGENT",
      assigneeId: user.id,
    },
  })

  // Cards in Done
  await prisma.card.create({
    data: {
      listId: doneList.id,
      title: "Project scaffold",
      description: "Set up monorepo with pnpm + Turborepo",
      position: "a",
      priority: "HIGH",
    },
  })

  // Labels on cards
  await Promise.all([
    prisma.cardLabel.create({ data: { cardId: card1.id, labelId: featureLabel.id } }),
    prisma.cardLabel.create({ data: { cardId: card2.id, labelId: featureLabel.id } }),
    prisma.cardLabel.create({ data: { cardId: card3.id, labelId: featureLabel.id } }),
    prisma.cardLabel.create({ data: { cardId: card3.id, labelId: urgentLabel.id } }),
  ])

  // Comment
  await prisma.comment.create({
    data: {
      cardId: card3.id,
      userId: user.id,
      content: "Migration SQL generated via prisma migrate diff. Awaiting Docker to apply.",
    },
  })

  // Activity
  await prisma.activity.create({
    data: {
      boardId: board.id,
      cardId: card3.id,
      userId: user.id,
      action: "card.created",
      metadata: { title: "Implement database schema", listName: "In Progress" },
    },
  })

  console.log(`Seed complete:
  User:          ${user.email}
  Organization:  ${org.name} (${org.slug})
  Workspace:     ${workspace.name}
  Board:         ${board.name}
  Lists:         To Do, In Progress, Done
  Cards:         4 cards across 3 lists
  Labels:        Bug, Feature, Urgent`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
