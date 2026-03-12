import { app } from "./app";
import { prisma } from "./config/db";
import { env } from "./config/env";

const boot = async (): Promise<void> => {
  await prisma.$connect();

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${env.port}`);
  });
};

boot().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("Server failed to start:", error);
  await prisma.$disconnect();
  process.exit(1);
});
