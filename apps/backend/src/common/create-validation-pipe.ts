import { ValidationPipe } from "@nestjs/common";

/** 全局请求体 / Query / Param 的 class-validator 校验（main 与集成测共用） */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
}
