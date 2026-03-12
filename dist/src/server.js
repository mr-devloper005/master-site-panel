"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const db_1 = require("./config/db");
const env_1 = require("./config/env");
const boot = async () => {
    await db_1.prisma.$connect();
    app_1.app.listen(env_1.env.port, () => {
        // eslint-disable-next-line no-console
        console.log(`Server running on http://localhost:${env_1.env.port}`);
    });
};
boot().catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error("Server failed to start:", error);
    await db_1.prisma.$disconnect();
    process.exit(1);
});
