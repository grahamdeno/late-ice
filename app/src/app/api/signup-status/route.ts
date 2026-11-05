import { handle } from "@/server/http";
import { signupsPaused } from "@/server/accounts";

export const dynamic = "force-dynamic";
export const GET = handle(async () => ({ paused: await signupsPaused() }));
