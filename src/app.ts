import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import authRoutes from "./modules/auth/auth.routes";
import { startContactEmailQueueWorker } from "./modules/contact/contact-email-queue";
import contactRoutes from "./modules/contact/contact.routes";
import postsRoutes from "./modules/posts/posts.routes";
import publicRoutes from "./modules/public/public.routes";
import runtimeRoutes from "./modules/runtime/runtime.routes";
import sitesRoutes from "./modules/sites/sites.routes";
import { startIndexingScheduler } from "./modules/sites/indexing-scheduler";
import tasksRoutes, { siteTaskRouter } from "./modules/tasks/tasks.routes";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "multi-site-backend",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/sites", sitesRoutes);
app.use("/api/v1/contact-submissions", contactRoutes);
app.use("/api/v1/posts", postsRoutes);
app.use("/api/v1/tasks", tasksRoutes);
app.use("/", siteTaskRouter);
app.use("/api/v1/public", publicRoutes);
app.use("/api/v1/runtime", runtimeRoutes);

startIndexingScheduler();
startContactEmailQueueWorker();

app.use(notFoundHandler);
app.use(errorHandler);
