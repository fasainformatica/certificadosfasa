import { randomBytes } from "node:crypto";

const token = randomBytes(32).toString("base64url");

console.log("Copie estes valores para o ambiente do servidor:");
console.log("");
console.log("WINDOWS_NOTIFIER_ENABLED=true");
console.log(`WINDOWS_NOTIFIER_TOKEN=${token}`);
console.log("WINDOWS_NOTIFIER_ROLE=financeiro");
console.log("");
console.log("Depois copie apenas o valor de WINDOWS_NOTIFIER_TOKEN para tools/windows-notifier/config.local.json.");
