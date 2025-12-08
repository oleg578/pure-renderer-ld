import {Router} from "express";
import {PageRenderer} from "../services/pageRenderer.js";
import {normalizeHttpUrl} from "../utils/url.js";
import {ProcessTracker} from "../utils/processTracker.js";

export const createRenderRouter = (pageRenderer, processTracker) => {
  const router = Router();

  router.get(
    "/render",
    async (req, res, next) => {
      try {
        const url = normalizeHttpUrl(req.query?.url);
        const html = await processTracker.track(() => pageRenderer.render(url));
        res.type("text/html").status(200).send(html);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/progress",
    async (_req, res, next) => {
      try {
        const progress = await processTracker.getProgress();
        res.status(200).json({progress});
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};
