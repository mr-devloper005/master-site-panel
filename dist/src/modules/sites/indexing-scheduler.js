"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopIndexingScheduler = exports.startIndexingScheduler = void 0;
const google_indexing_1 = require("./google-indexing");
const ENABLED = process.env.INDEXING_SCHEDULER_ENABLED !== "false";
const INTERVAL_MS = Math.max(Number(process.env.INDEXING_SCHEDULER_INTERVAL_MS || 30 * 60 * 1000), 60 * 1000);
let timer = null;
let running = false;
const tick = async () => {
    if (!ENABLED || running)
        return;
    running = true;
    try {
        const result = await (0, google_indexing_1.runDueIndexingForAllSites)();
        if (result.totalUrlsProcessed > 0) {
            console.log(`[indexing-scheduler] processed ${result.totalUrlsProcessed} URLs across ${result.sitesProcessed} site(s)`);
        }
    }
    catch (error) {
        console.warn("[indexing-scheduler] run failed", error);
    }
    finally {
        running = false;
    }
};
const startIndexingScheduler = () => {
    if (!ENABLED || timer)
        return;
    timer = setInterval(() => {
        void tick();
    }, INTERVAL_MS);
    setTimeout(() => {
        void tick();
    }, 10000);
    console.log(`[indexing-scheduler] started (interval=${INTERVAL_MS}ms)`);
};
exports.startIndexingScheduler = startIndexingScheduler;
const stopIndexingScheduler = () => {
    if (!timer)
        return;
    clearInterval(timer);
    timer = null;
};
exports.stopIndexingScheduler = stopIndexingScheduler;
