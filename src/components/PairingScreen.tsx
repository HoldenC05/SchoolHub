import { useState } from "react";
import { setToken } from "../lib/api";
import { Button, TextInput } from "./ui";

export function PairingScreen() {
  const [token, setTokenValue] = useState("");

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center">
        <div className="mb-3 text-4xl">🔐</div>
        <h1 className="mb-1 text-xl font-semibold text-slate-100">Pair this device</h1>
        <p className="mb-5 text-sm text-slate-400">
          On your <strong>Mac</strong>, open School Hub and go to{" "}
          <strong>Integrations</strong> in the left sidebar — scan the QR code with your phone, or
          copy the token from there and paste it below.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) {
              setToken(token.trim());
              window.location.reload();
            }
          }}
          className="flex flex-col gap-3"
        >
          <TextInput
            value={token}
            onChange={setTokenValue}
            placeholder="Paste pairing token"
          />
          <Button type="submit">Connect</Button>
        </form>
      </div>
    </div>
  );
}
