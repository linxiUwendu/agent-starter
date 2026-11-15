import { Transform } from "class-transformer";

/** DTO 字段装饰器：入参 string 先 trim 再交给 class-validator */
export function TrimString(): PropertyDecorator {
  return Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
}
