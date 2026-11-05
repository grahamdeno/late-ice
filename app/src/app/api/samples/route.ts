import { handle } from "@/server/http";
import { SAMPLES } from "@/server/sheets";

export const GET = handle(async () => SAMPLES.map(({ id, title, file }) => ({ id, title, image: `/samples/${file}` })));
