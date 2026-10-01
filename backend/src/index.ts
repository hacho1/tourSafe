import express, { type ErrorRequestHandler } from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { api } from "./routes/api.js";

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use("/api", api);
app.use("/api", (_req, res) =>
  res.status(404).json({ message: "요청한 API를 찾을 수 없습니다." }),
);
const client = fileURLToPath(
  new URL("../../../frontend/dist/", import.meta.url),
);
if (existsSync(client)) {
  app.use(express.static(client));
  app.get("/{*path}", (_req, res) =>
    res.sendFile("index.html", { root: client }),
  );
}
const errors: ErrorRequestHandler = (_error, _req, res, _next) => {
  res
    .status(500)
    .json({
      message: "정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
};
app.use(errors);
app.listen(config.port, config.host, () =>
  console.log(
    `TourSafe API: http://${config.host}:${config.port} · ${config.tourKey ? "LIVE" : config.useMock ? "DEMO" : "LIVE (no key)"}`,
  ),
);
