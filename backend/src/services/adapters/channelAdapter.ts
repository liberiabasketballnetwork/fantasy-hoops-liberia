/**
 * channelAdapter.ts — GROWTH-004
 *
 * Common interface all delivery adapters must implement.
 * The CommunicationHub depends only on this interface —
 * never on adapter internals.
 */

export type ChannelId = "notification" | "whatsapp" | "sms" | "email" | "push";

export type DeliveryState = "prepared" | "submitted" | "confirmed" | "failed" | "skipped";

export interface ChannelRecipient {
  user_id:      string;
  display_name: string;
  phone_masked: string;
  phone_raw?:   string;       // full international number, used by phone channels
  first_name?:  string;
  rank?:        number;
  referral_link?: string;
  gameweek_label?: string;
}

export interface MessageContent {
  campaign_id:       string;
  notification_type: string;
  subject:           string;  // notification title / WhatsApp subject
  message:           string;  // body (may contain {{merge_fields}})
  link?:             string;
  priority?:         string;
}

export interface AdapterResult {
  channel:   ChannelId;
  user_id:   string;
  state:     DeliveryState;
  reference?: string;          // WhatsApp link URL, SMS message ID, etc.
}

export interface ChannelCapability {
  channelId:                  ChannelId;
  label:                      string;
  supportsPersonalization:     boolean;
  supportsScheduling:          boolean;
  supportsDeliveryConfirmation: boolean;
  requiresPhone:               boolean;
  requiresEmail:               boolean;
  available:                   boolean;   // false = show as "Coming Soon"
}

export interface ChannelAdapter {
  readonly capability: ChannelCapability;

  /**
   * Send a message to a single recipient.
   * Called by CommunicationHub for each recipient in the resolved audience.
   */
  send(recipient: ChannelRecipient, content: MessageContent): Promise<AdapterResult>;
}
