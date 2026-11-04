import { randomUUID } from "node:crypto";

export * from "@texcollab/db";
export const newAssetId = () => randomUUID().replace(/-/g, "");
