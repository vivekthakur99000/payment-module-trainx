import { Router } from "express";
import {
  createOrder,
  getOrderStatus,
} from "../controller/payment.controller.js";
import { handleCashfreeWebhook } from "../controller/webhook.controller.js";

const paymentRouter = Router();

paymentRouter.post("/create-order", createOrder);
paymentRouter.post("/webhook", handleCashfreeWebhook);
paymentRouter.get("/status/:orderId", getOrderStatus);

export default paymentRouter;
