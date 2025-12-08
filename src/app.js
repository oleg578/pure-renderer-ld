import express from "express";
import {HttpError} from "./errors/httpError.js";
import {createRenderRouter} from "./routes/renderRoute.js";
import {PageRenderer} from "./services/pageRenderer.js";
import {ProcessTracker} from "./utils/processTracker.js";

/**
 * Wires up the express application with routes and error handling.
 * @param {{pageRenderer: PageRenderer, processTracker: ProcessTracker}} deps
 * @returns {import("express").Application}
 */
export const createApp = ({pageRenderer, processTracker}) => {
  const app = express();

  app.use(express.urlencoded({extended: false}));

  app.use(createRenderRouter(pageRenderer, processTracker));

  // Ensure unknown routes return JSON instead of Express HTML 404 page
  app.use((_req, res) => res.status(404).json({error: "Not found"}));

  app.use((err, _req, res, _next) => {
    const {statusCode, message} = normalizeError(err);
    if (statusCode >= 500) {
      console.error(err);
    }

    const clientMessage = statusCode >= 500 ? "Internal server error" : message;
    res.status(statusCode).json({error: clientMessage});
  });

  return app;
};

function normalizeError(err) {
  if (err instanceof HttpError) {
    return err;
  }

  if (err instanceof Error) {
    return new HttpError(500, err.message);
  }

  return new HttpError(500, "Unexpected error");
}

/**
 * Builds an app instance with freshly constructed dependencies.
 * @param {ProcessTracker} processTracker
 * @returns {import("express").Application}
 */
export const bootstrapApp = (processTracker) => {
  const pageRenderer = new PageRenderer();
  return createApp({pageRenderer, processTracker});
};
