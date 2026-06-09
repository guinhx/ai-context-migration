import type { InputProvider, OutputProvider } from "./provider.ts";

// ---------------------------------------------------------------------------
// Provider Registry
// ---------------------------------------------------------------------------

class ProviderRegistry {
  private readonly inputs = new Map<string, InputProvider>();
  private readonly outputs = new Map<string, OutputProvider>();

  registerInput(provider: InputProvider): void {
    this.inputs.set(provider.id, provider);
  }

  registerOutput(provider: OutputProvider): void {
    this.outputs.set(provider.id, provider);
  }

  getInput(id: string): InputProvider {
    const provider = this.inputs.get(id);
    if (!provider) {
      const available = [...this.inputs.keys()].join(", ") || "none";
      throw new Error(
        `Unknown input provider "${id}". Available: ${available}`
      );
    }
    return provider;
  }

  getOutput(id: string): OutputProvider {
    const provider = this.outputs.get(id);
    if (!provider) {
      const available = [...this.outputs.keys()].join(", ") || "none";
      throw new Error(
        `Unknown output provider "${id}". Available: ${available}`
      );
    }
    return provider;
  }

  listInputs(): InputProvider[] {
    return [...this.inputs.values()];
  }

  listOutputs(): OutputProvider[] {
    return [...this.outputs.values()];
  }
}

export const registry = new ProviderRegistry();
