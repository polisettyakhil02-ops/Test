import { Router } from "express";
import authRoutes from "./auth.routes.js";
import patientRoutes from "./patient.routes.js";
import ipdRoutes from "./ipd.routes.js";
import emrRoutes from "./emr.routes.js";
import pharmacyRoutes from "./pharmacy.routes.js";
import billingRoutes from "./billing.routes.js";
import adminRoutes from "./admin.routes.js";
import limsRoutes from "./lims.routes.js";
import otRoutes from "./ot.routes.js";
import assetRoutes from "./asset.routes.js";
import payrollRoutes from "./payroll.routes.js";
import insuranceRoutes from "./insurance.routes.js";

/**
 * Main API router, mounted at "/api" by `app.ts`. `patientRoutes` spans
 * two resource prefixes ("/patients" and "/appointments" — see its own
 * file for why) and so declares its own full paths; every other domain
 * router is mounted here under its natural "/<domain>" prefix.
 */
const router = Router();

router.use("/auth", authRoutes);
router.use(patientRoutes);
router.use("/ipd", ipdRoutes);
router.use("/emr", emrRoutes);
router.use("/pharmacy", pharmacyRoutes);
router.use("/billing", billingRoutes);
router.use("/admin", adminRoutes);
router.use("/lims", limsRoutes);
router.use("/ot", otRoutes);
router.use("/assets", assetRoutes);
router.use("/payroll", payrollRoutes);
router.use("/insurance", insuranceRoutes);

export default router;
