import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const admins = await db.$queryRawUnsafe<any[]>(`SELECT id, username, email, is_admin FROM up_users`);
  console.log("USERS:", JSON.stringify(admins));
  const lnks = await db.$queryRawUnsafe<any[]>(`SELECT * FROM up_users_role_lnk`);
  console.log("ROLE_LNKS:", JSON.stringify(lnks));
  const roles = await db.$queryRawUnsafe<any[]>(`SELECT id, name, type FROM up_roles`);
  console.log("ROLES:", JSON.stringify(roles));
  await db.$disconnect();
}
main();
