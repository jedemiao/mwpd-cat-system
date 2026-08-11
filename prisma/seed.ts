import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Matches the dropdown list already used in the Excel tracker.
// Usernames are "firstname.lastname" (compound given names kept together,
// middle initials and honorifics dropped). Replace usernames/passwords
// before real use — this is a starting seed only.
const STAFF = [
  { name: "Anthony C. Fuentes", username: "anthony.fuentes", role: Role.DIVISION_CHIEF },
  { name: "Atty. Marinelle Aycee M. Perral", username: "marinelleaycee.perral", role: Role.STAFF },
  { name: "Cherryl C. Oculam", username: "cherryl.oculam", role: Role.STAFF },
  { name: "Apple Mae C. Tandoy", username: "applemae.tandoy", role: Role.STAFF },
  { name: "Chris Ann M. Cabodbod", username: "chrisann.cabodbod", role: Role.STAFF },
  { name: "Al S. Polinar", username: "al.polinar", role: Role.STAFF },
  { name: "Ray Angelo A. Sajor", username: "rayangelo.sajor", role: Role.STAFF },
  { name: "Shella Claire L. Sombilon", username: "shellaclaire.sombilon", role: Role.STAFF },
  { name: "Admin Staff", username: "admin", role: Role.RECORDS_STAFF },
];

async function main() {
  const office = await prisma.office.upsert({
    where: { code: "MWPTD-CARAGA" },
    update: {},
    // No "- Caraga" suffix: this deployment serves only Region XIII, so the
    // region is implied on every unit and just crowds the sidebar.
    create: { name: "Migrant Workers Protection Division", code: "MWPTD-CARAGA" },
  });

  const defaultPasswordHash = await bcrypt.hash("changeme123", 10);

  for (const staff of STAFF) {
    await prisma.user.upsert({
      where: { username: staff.username },
      update: {},
      create: {
        officeId: office.id,
        name: staff.name,
        username: staff.username,
        passwordHash: defaultPasswordHash,
        role: staff.role,
      },
    });
  }

  console.log(`Seeded office "${office.name}" with ${STAFF.length} staff accounts.`);
  console.log(`Default password for all seeded accounts: changeme123 (change immediately).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
