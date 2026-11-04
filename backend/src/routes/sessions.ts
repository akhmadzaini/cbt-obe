import { Elysia } from "elysia";
import { sessionStartRoutes } from "./sessions/start";
import { sessionAnswerRoutes } from "./sessions/answers";
import { sessionViolationRoutes } from "./sessions/violations";
import { sessionControlRoutes } from "./sessions/control";

export const sessionRoutes = new Elysia()
  .use(sessionStartRoutes)
  .use(sessionAnswerRoutes)
  .use(sessionViolationRoutes)
  .use(sessionControlRoutes);
