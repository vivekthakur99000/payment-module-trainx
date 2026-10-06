import "dotenv/config";
import cors from "cors";
import express, { type Request } from "express";
import paymentRouter from "./routes/payment.routes.js";

type RequestWithRawBody = Request & { rawBody?: string };

const app = express();

app.use(cors());
app.use(
  express.json({
    verify: (req, _res, buffer) => {
      (req as RequestWithRawBody).rawBody = buffer.toString("utf8");
    },
  }),
);

app.get("/", (_req, res) => {
  res.send("Hello, World!");
});

app.use("/api", paymentRouter);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
