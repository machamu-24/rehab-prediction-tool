import "dotenv/config";
import { startLocalServer } from "./server";

async function main() {
  const host = process.env.HOST || "127.0.0.1";
  const preferred = Number(process.env.PORT || 3020);
  if (!Number.isInteger(preferred) || preferred < 1024 || preferred > 65515)
    throw new Error("PORTは1024〜65515で設定してください");
  for (let port = preferred; port < preferred + 20; port++) {
    try {
      const instance = await startLocalServer({
        host,
        port,
        development: process.env.NODE_ENV === "development",
      });
      console.log(`Server running on ${instance.url}/`);
      for (const signal of ["SIGINT", "SIGTERM"] as const)
        process.once(signal, () => {
          instance.close().then(
            () => process.exit(0),
            () => process.exit(1)
          );
        });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("起動用ポートを確保できませんでした");
}
main().catch(error => {
  console.error(
    error instanceof Error ? error.message : "起動できませんでした"
  );
  process.exitCode = 1;
});
