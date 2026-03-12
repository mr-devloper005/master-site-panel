import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const createRawApiKey = (): string => crypto.randomBytes(24).toString("hex");
const hashApiKey = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const run = async (): Promise<void> => {
  const raw = createRawApiKey();

  const created = await prisma.apiKey.create({
    data: {
      name: "super-admin",
      keyHash: hashApiKey(raw),
      scopes: ["*"],
    },
  });

  console.log("API key seeded.");
  console.log("apiKeyId:", created.id);
  console.log("rawApiKey:", raw);
  console.log("Store rawApiKey securely. It will not be visible again.");
};

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
