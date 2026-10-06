import type { Request, Response } from "express";
import cashfree from "../config/cashfree.js";
import { prisma } from "../config/db.js";
import type { Prisma } from "../generated/prisma/client.js";

function toPrismaJson(value: object): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Payment response could not be serialized as JSON");
  }

  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

export async function createOrder(req: Request, res: Response) {
  try {
    const { amount, customerPhone, customerEmail, customerName } = req.body;

    let student = await prisma.student.findFirst({
      where: { email: customerEmail },
    });

    if (!student) {
      student = await prisma.student.create({
        data: {
          rollNo: `ROLL_${Date.now()}`,
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
        },
      });
    }

    const order = await prisma.order.create({
      data: {
        amount,
        studentId: student.id,
        status: "PENDING",
      },
    });

    const response = await cashfree.PGCreateOrder({
      order_amount: amount,
      order_currency: "INR",
      order_id: order.id,
      customer_details: {
        customer_id: student.id,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        customer_name: customerName,
      },
      order_meta: {
        return_url: `http://localhost:3000/api/verify?order_id=${order.id}`,
      },
    });

    return res.status(200).json({
      message: "Order created successfully",
      orderId: order.id,
      paymentSessionId: response.data.payment_session_id,
    });
  } catch (error) {
    console.error("Order creation error:", error);
    return res.status(500).json({ error: "Failed to create order" });
  }
}

export async function getOrderStatus(req: Request, res: Response) {
  try {
    const { orderId } = req.params;
    if (!orderId || Array.isArray(orderId)) {
      return res.status(400).json({ error: "Invalid order ID" });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "PENDING") {
      return res.status(200).json({ status: order.status });
    }

    const response = await cashfree.PGOrderFetchPayments(orderId);
    const successfulPayment = response.data.find(
      (payment) => payment.payment_status === "SUCCESS",
    );

    if (!successfulPayment) {
      return res.status(200).json({ status: "PENDING" });
    }

    if (
      successfulPayment.cf_payment_id === undefined ||
      successfulPayment.payment_amount === undefined
    ) {
      throw new Error("Cashfree returned incomplete successful payment details");
    }

    await prisma.payment.upsert({
      where: { cfPaymentId: String(successfulPayment.cf_payment_id) },
      update: {
        status: "SUCCESS",
        gatewayResponse: toPrismaJson(successfulPayment),
      },
      create: {
        cfPaymentId: String(successfulPayment.cf_payment_id),
        orderId,
        amount: successfulPayment.payment_amount,
        status: "SUCCESS",
        paymentMethod: successfulPayment.payment_group,
        gatewayResponse: toPrismaJson(successfulPayment),
      },
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { status: "PAID" },
    });

    console.log(`Fallback sync: Order ${orderId} marked as PAID`);
    return res.status(200).json({ status: "PAID" });
  } catch (error) {
    console.error("Status verification error:", error);
    return res.status(500).json({ error: "Failed to verify status" });
  }
}
