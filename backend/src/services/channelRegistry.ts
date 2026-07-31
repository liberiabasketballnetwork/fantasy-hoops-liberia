/**
 * channelRegistry.ts — GROWTH-004
 *
 * Owns adapter discovery. The Hub requests adapters through the registry.
 * Adding a new channel requires only: (1) implement ChannelAdapter, (2) register here.
 * No changes to hub, campaign service, or routes.
 */

import type { ChannelId, ChannelAdapter, ChannelCapability } from "./adapters/channelAdapter";
import { NotificationAdapter }  from "./adapters/notificationAdapter";
import { WhatsAppLinkAdapter }  from "./adapters/whatsAppLinkAdapter";

class ChannelRegistryClass {
  private adapters = new Map<ChannelId, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.capability.channelId, adapter);
  }

  get(channelId: ChannelId): ChannelAdapter | undefined {
    return this.adapters.get(channelId);
  }

  getAll(): ChannelAdapter[] {
    return [...this.adapters.values()];
  }

  capabilities(): ChannelCapability[] {
    return [...this.adapters.values()].map((a) => a.capability);
  }

  available(): ChannelId[] {
    return [...this.adapters.values()]
      .filter((a) => a.capability.available)
      .map((a) => a.capability.channelId);
  }
}

// Singleton registry — adapters registered at module load
export const channelRegistry = new ChannelRegistryClass();

// Phase 1 adapters
channelRegistry.register(new NotificationAdapter());
channelRegistry.register(new WhatsAppLinkAdapter());

// Phase 2: channelRegistry.register(new WhatsAppCloudAdapter());
// Phase 2: channelRegistry.register(new SMSAdapter());
// Phase 2: channelRegistry.register(new EmailAdapter());
