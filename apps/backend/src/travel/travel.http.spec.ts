import { Test, type TestingModule } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AppModule } from "../app.module";
import { createValidationPipe } from "../common/create-validation-pipe";

describe("Travel HTTP (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MOCK_AGENT = "true";
    process.env.TRAVEL_ANSWER = "fallback";
    process.env.AUTH_ALLOW_DEV_LOGIN = "true";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-supertest";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/travel/health returns ok", async () => {
    const res = await request(app.getHttpServer()).get("/api/travel/health").expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.name).toBeDefined();
  });

  it("POST /api/travel/chat returns 400 when messages invalid", async () => {
    await request(app.getHttpServer())
      .post("/api/travel/chat")
      .send({ messages: [{ role: "system", content: "x" }] })
      .expect(400);

    await request(app.getHttpServer()).post("/api/travel/chat").send({ messages: [] }).expect(400);
  });

  it("POST /api/travel/conversations returns 401 without auth", async () => {
    await request(app.getHttpServer())
      .post("/api/travel/conversations")
      .send({ city: "chengdu", title: "x" })
      .expect(401);
  });

  it("POST /api/auth/dev-login then create conversation", async () => {
    const agent = request.agent(app.getHttpServer());

    const login = await agent
      .post("/api/auth/dev-login")
      .send({ email: "supertest@example.com", displayName: "Supertest" });

    expect([200, 201]).toContain(login.status);
    expect(login.body.user).toBeDefined();

    const created = await agent
      .post("/api/travel/conversations")
      .send({ city: "chengdu", title: "integration" });

    expect([200, 201]).toContain(created.status);

    expect(created.body.id).toBeDefined();
  });

  it(
    "POST /api/travel/chat sets SSE headers",
    async () => {
      const res = await request(app.getHttpServer())
        .post("/api/travel/chat")
        .send({
          messages: [{ role: "user", content: "ping" }],
          city: "chengdu",
        })
        .timeout(120_000);

      expect(res.status).toBe(200);
      expect(String(res.headers["content-type"])).toMatch(/text\/event-stream/);
    },
    120_000,
  );

  it(
    "POST /api/travel/chat SSE body contains context event before done",
    async () => {
      const res = await request(app.getHttpServer())
        .post("/api/travel/chat")
        .send({
          messages: [{ role: "user", content: "成都火锅推荐" }],
          city: "chengdu",
        })
        .timeout(120_000);

      const body = String(res.text ?? "");
      const contextIdx = body.indexOf("event: context");
      const doneIdx = body.indexOf("event: done");
      expect(contextIdx).toBeGreaterThanOrEqual(0);
      expect(doneIdx).toBeGreaterThan(contextIdx);
    },
    120_000,
  );
});
