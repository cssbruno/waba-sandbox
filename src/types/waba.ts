export type WabaMessageBase = {
  from: string;
  id: string;
  timestamp: string;
};

export interface WabaTextMessage extends WabaMessageBase {
  type: "text";
  text: {
    body: string;
  };
}

export interface WabaImageMessage extends WabaMessageBase {
  type: "image";
  image: {
    id?: string;
    mime_type?: string;
    sha256?: string;
    caption?: string;
    link?: string;
  };
}

export interface WabaDocumentMessage extends WabaMessageBase {
  type: "document";
  document: {
    id?: string;
    filename?: string;
    mime_type?: string;
    sha256?: string;
    caption?: string;
    link?: string;
  };
}

export interface WabaAudioMessage extends WabaMessageBase {
  type: "audio";
  audio: {
    id?: string;
    mime_type?: string;
    sha256?: string;
    voice?: boolean;
    link?: string;
  };
}

export interface WabaVideoMessage extends WabaMessageBase {
  type: "video";
  video: {
    id?: string;
    mime_type?: string;
    sha256?: string;
    caption?: string;
    link?: string;
  };
}

export interface WabaStickerMessage extends WabaMessageBase {
  type: "sticker";
  sticker: {
    id?: string;
    mime_type?: string;
    sha256?: string;
    link?: string;
  };
}

export interface WabaLocationMessage extends WabaMessageBase {
  type: "location";
  location: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}

export interface WabaContactsMessage extends WabaMessageBase {
  type: "contacts";
  contacts: Array<{
    name: {
      formatted_name: string;
      first_name?: string;
      last_name?: string;
    };
    phones?: Array<{
      phone: string;
      type?: string;
      wa_id?: string;
    }>;
    emails?: Array<{
      email: string;
      type?: string;
    }>;
    addresses?: Array<{
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      country_code?: string;
      type?: string;
    }>;
  }>;
}

export interface WabaReactionMessage extends WabaMessageBase {
  type: "reaction";
  reaction: {
    message_id: string;
    emoji: string;
  };
}

export interface WabaTemplateMessage extends WabaMessageBase {
  type: "template";
  template: {
    name: string;
    language: {
      code: string;
    };
    components?: unknown[];
  };
}

export interface WabaInteractiveMessage extends WabaMessageBase {
  type: "interactive";
  interactive: {
    type:
      | "button_reply"
      | "list_reply"
      | "product_list"
      | "product"
      | "media"
      | "flow";
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
    // Product or media carousel replies and other metadata are left generic
    flow_id?: string;
    flow_token?: string;
    flow_action?: string;
    flow_action_payload?: Record<string, unknown>;
    flow_cta?: string;
    flow_status?: string;
    flow_name?: string;
    [key: string]: unknown;
  };
}

export type WabaMessage =
  | WabaTextMessage
  | WabaImageMessage
  | WabaDocumentMessage
  | WabaAudioMessage
  | WabaVideoMessage
  | WabaStickerMessage
  | WabaLocationMessage
  | WabaContactsMessage
  | WabaReactionMessage
  | WabaTemplateMessage
  | WabaInteractiveMessage;

export interface WabaWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: "whatsapp";
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: { name: string };
        wa_id: string;
      }>;
      messages?: WabaMessage[];
      statuses?: Array<{
        id: string;
        status: "sent" | "delivered" | "read" | "failed" | "typing";
        timestamp: string;
        recipient_id: string;
      }>;
    };
    field: "messages";
  }>;
}

export interface WabaWebhookPayload {
  object: "whatsapp_business_account";
  entry: WabaWebhookEntry[];
}
