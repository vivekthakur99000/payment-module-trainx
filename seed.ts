import "dotenv/config";
import { prisma } from "./config/db";

async function main() {
  const newStudent = await prisma.student.create({
    data: {
      rollNo: "CS2024-001",
      name: "Rahul Kumar",
      email: "rahul.k@example.com",
      phone: "9876543210",
    },
  });

  console.log("✅ Student successfully created!");
  console.log("Student ID:", newStudent.id);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("❌ Error creating student:", error);
    await prisma.$disconnect();
    process.exit(1);
  });