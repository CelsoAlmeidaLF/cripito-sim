
const { test } = require("node:test");
const assert = require("node:assert/strict");

function bufToB64(buf) { return Buffer.from(buf).toString("base64"); }
function b64ToBuf(b64) { return Buffer.from(b64, "base64"); }

function getCombinedSecret(password, certSecret) {
  return password + "::DEVICE_CERT::" + (certSecret || "");
}

async function deriveAesKey(combinedSecret, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(combinedSecret), { name: "PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: 150000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptJSON(obj, password, certSecret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const combined = getCombinedSecret(password, certSecret);
  const key = await deriveAesKey(combined, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    encrypted: true,
    certProtected: true,
    certId: "CEL-12345",
    salt: bufToB64(salt),
    iv: bufToB64(iv),
    ciphertext: bufToB64(ciphertext),
  };
}

async function decryptJSON(payload, password, certSecret) {
  const salt = b64ToBuf(payload.salt);
  const iv = b64ToBuf(payload.iv);
  const ciphertext = b64ToBuf(payload.ciphertext);

  if (payload.certProtected) {
    if (!certSecret) throw new Error("CERT_REQUIRED");
    const combined = getCombinedSecret(password, certSecret);
    const key = await deriveAesKey(combined, salt);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plainBuf));
  }
}

test("2FA Criptográfico: Sucesso com Senha + Certificado correto", async () => {
  const payload = await encryptJSON({ saldo: 10000 }, "minhasenha", "segredo-do-celular");
  const decrypted = await decryptJSON(payload, "minhasenha", "segredo-do-celular");
  assert.equal(decrypted.saldo, 10000);
});

test("2FA Criptográfico: Falha se tiver a senha correta mas sem o certificado do celular", async () => {
  const payload = await encryptJSON({ saldo: 10000 }, "minhasenha", "segredo-do-celular");
  await assert.rejects(async () => {
    await decryptJSON(payload, "minhasenha", null);
  }, /CERT_REQUIRED/);
});

test("2FA Criptográfico: Falha se tiver a senha correta mas certificado de outro aparelho", async () => {
  const payload = await encryptJSON({ saldo: 10000 }, "minhasenha", "segredo-do-celular");
  await assert.rejects(async () => {
    await decryptJSON(payload, "minhasenha", "segredo-outro-celular");
  });
});
