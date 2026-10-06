import type { Request, Response } from "express";
import type {
  PaymentEntity,
  PaymentWebhookOrderEntity,
} from "cashfree-pg";
import cashfree from "../config/cashfree.js";
import { prisma } from "../config/db.js";
import type { Prisma } from "../generated/prisma/client.js";

type RequestWithRawBody = Request & { rawBody?: string };

type CashfreeWebhookPayload = {
  type?: string;
  event_time?: string;
  data?: {
    order?: PaymentWebhookOrderEntity;
    payment?: PaymentEntity;
  };
};

function toPrismaJson(value: object): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Payment response could not be serialized as JSON");
  }

  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

export async function handleCashfreeWebhook(req: Request, res: Response) {
  const signature = req.headers["x-webhook-signature"];
  const timestamp = req.headers["x-webhook-timestamp"];
  const rawBody = (req as RequestWithRawBody).rawBody;

  if (
    typeof signature !== "string" ||
    typeof timestamp !== "string" ||
    typeof rawBody !== "string"
  ) {
    return res.status(400).send("Missing webhook signature, timestamp, or body");
  }

  let payload: CashfreeWebhookPayload;
  try {
    const verifiedEvent = cashfree.PGVerifyWebhookSignature(
      signature,
      rawBody,
      timestamp,
    );
    payload = verifiedEvent.object as CashfreeWebhookPayload;
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return res.status(400).send("Invalid signature");
  }

  try {
    const log = await prisma.webhookLog.create({
      data: {
        eventId: payload.event_time ?? null,
        payload: payload as object,
        signatureValid: true,
      },
    });

    if (payload.type === "PAYMENT_SUCCESS_WEBHOOK") {
      const payment = payload.data?.payment;
      const orderId = payload.data?.order?.order_id;

      if (
        !payment ||
        payment.cf_payment_id === undefined ||
        typeof payment.payment_amount !== "number" ||
        !orderId
      ) {
        return res.status(400).send("Webhook is missing payment details");
      }

      await prisma.payment.upsert({
        where: { cfPaymentId: String(payment.cf_payment_id) },
        update: {
          status: "SUCCESS",
          gatewayResponse: toPrismaJson(payment),
        },
        create: {
          cfPaymentId: String(payment.cf_payment_id),
          orderId,
          amount: payment.payment_amount,
          status: "SUCCESS",
          paymentMethod: payment.payment_group,
          gatewayResponse: toPrismaJson(payment),
        },
      });

      await prisma.order.update({
        where: { id: orderId },
        data: { status: "PAID" },
      });

      console.log(`Order ${orderId} marked as PAID`);
    }

    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { processed: true },
    });

    return res.status(200).send("Webhook received");
  } catch (error) {
    console.error("Webhook processing error:", error);
    return res.status(500).send("Internal Server Error");
  }
}
