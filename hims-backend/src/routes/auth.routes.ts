import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { login, refresh, logout, me } from "../controllers/auth.controller.js";

/**
 * Mounted at "/api/auth" by routes/index.ts. The app-level rate limiter
 * in app.ts applies its strict "/api/auth/*" bucket to every route here,
 * so no per-route limiter is needed in this file.
 *
 * None of these routes carry the generic `auditLogger` middleware used
 * elsewhere: `AuthService` already writes precise LOGIN/LOGIN_FAILED/
 * LOGOUT entries itself (the generic middleware can't — it derives the
 * actor from `req.user`, which isn't set yet on `/login` and isn't
 * meaningful on an already-expired `/refresh` call), and logging every
 * `/refresh`/`/me` call would just add high-frequency noise with no
 * investigative value.
 */
const router = Router();

router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/me", protect, me);

export default router;
