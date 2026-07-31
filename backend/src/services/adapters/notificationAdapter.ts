/**
 * notificationAdapter.ts — GROWTH-004
 *
 * Wraps the existing notificationEventEngine.dispatch().
 * No behavioural changes — idempotency, Notification Center,
 * and analytics all work exactly as before.
 */

import { notificationEngine } from "../notificationEventEngine";
import type { NotificationType, NotificationPriority } from "../notificationEventEngine";
import type {
  ChannelAdapter, ChannelCapability,
  ChannelRecipient, MessageContent, AdapterResult,
} from "./channelAdapter";

export class NotificationAdapter implements ChannelAdapter {
  readonly capability: ChannelCapability = {
    channelId:                   "notification",
    label:                       "In-App Notification",
    supportsPersonalization:     false,
    supportsScheduling:          false,
    supportsDeliveryConfirmation: true,
    requiresPhone:               false,
    requiresEmail:               false,
    available:                   true,
  };

  async send(recipient: ChannelRecipient, content: MessageContent): Promise<AdapterResult> {
    try {
      const result = await notificationEngine.dispatch({
        idempotencyKey: `CAMPAIGN:${content.campaign_id}:${recipient.user_id}:notification`,
        user_id:        recipient.user_id,
        type:           content.notification_type as NotificationType,
        title:          content.subject,
        message:        content.message,
        link:           content.link ?? undefined,
        priority:       (content.priority ?? "normal") as NotificationPriority,
        metadata:       { campaign_id: content.campaign_id },
      });

      return {
        channel:  "notification",
        user_id:  recipient.user_id,
        state:    result.dispatched > 0 ? "confirmed" : "skipped",
      };
    } catch {
      return { channel: "notification", user_id: recipient.user_id, state: "failed" };
    }
  }
}
