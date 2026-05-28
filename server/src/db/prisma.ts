import { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { config } from "../config.js";

const { DB_HOST, DB_USER, DB } = process.env;
if (!DB_HOST || !DB_USER || !DB) {
  throw new Error("Missing required DB env variables");
}

const adapter = new PrismaMariaDb({
  host: config.DB_HOST,
  user: config.DB_USER,
  database: config.DB,
});

export const prisma = new PrismaClient({ adapter });