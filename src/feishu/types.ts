export type FeishuMention = {
  key: string;
  id: {
    open_id?: string;
    user_id?: string;
    union_id?: string;
  };
  name: string;
  tenant_key?: string;
};

export type FeishuMessageEvent = {
  sender: {
    sender_id: {
      open_id?: string;
      user_id?: string;
      union_id?: string;
    };
    sender_type?: string;
    tenant_key?: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    chat_id: string;
    chat_type: 'p2p' | 'group';
    message_type: string; // "text" | "post" | ...
    content: string; // JSON string
    mentions?: FeishuMention[];
  };
};

export type Inbound = {
  chat_id: string;
  chat_type: 'p2p' | 'group';
  message_id: string;

  sender_open_id?: string;
  sender_user_id?: string;
  sender_name?: string;

  message_type: string;
  raw_content: string;
  text: string;

  mentioned_bot: boolean;
  reply_to_message_id?: string;
};

