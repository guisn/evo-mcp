const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { z } = require("zod");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

// Helper function to get required env vars or throw
const getEnv = (varName, defaultValue = undefined) => {
  const value = process.env[varName];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
  return value || defaultValue;
};

// --- Zod Schemas for Tool Inputs ---
const schemas = {
  toolInputs: {
    // --- Instance ---
    create_instance: z.object({
      instanceName: z.string().describe("Unique name for the new instance."),
      token: z.string().optional().describe("Optional predefined token (API key) for the instance."),
      qrcode: z.boolean().optional().default(true).describe("Whether to return the QR code for connection."),
      // Add other optional settings from Postman if needed (webhook, rabbitmq, etc.)
    }),
    fetch_instances: z.object({
       instanceName: z.string().optional().describe("Filter by instance name."),
       instanceId: z.string().optional().describe("Filter by instance ID."),
    }),
    connect_instance: z.object({
      // instanceName is part of the URL, handled globally
    }),
    restart_instance: z.object({
        // instanceName is part of the URL, handled globally
    }),
    set_presence: z.object({
        presence: z.enum(["available", "unavailable"]).describe("Presence status to set.")
    }),
    get_connection_state: z.object({
      // instanceName is part of the URL, handled globally
    }),
    logout_instance: z.object({
      // instanceName is part of the URL, handled globally
    }),
    delete_instance: z.object({
      // instanceName is part of the URL, handled globally
    }),

    // --- Settings ---
     set_settings: z.object({
        rejectCall: z.boolean().optional().describe("Reject incoming calls?"),
        msgCall: z.string().optional().describe("Message to send when rejecting calls."),
        groupsIgnore: z.boolean().optional().describe("Ignore group messages?"),
        alwaysOnline: z.boolean().optional().describe("Set status to always online?"),
        readMessages: z.boolean().optional().describe("Mark messages as read automatically?"),
        syncFullHistory: z.boolean().optional().describe("Sync full chat history on connection?"),
        readStatus: z.boolean().optional().describe("Mark status/stories as seen?")
     }),
     find_settings: z.object({
        // No specific inputs needed
     }),

    // --- Send Message ---
    send_text: z.object({
      number: z.string().describe("Recipient's phone number including country code (e.g., 5511999998888) or group JID (e.g., 1234567890@g.us)."),
      text: z.string().describe("The text message content."),
      options: z.object({
          delay: z.number().optional().describe("Delay in milliseconds before sending."),
          quoted: z.object({ // Simplified quoted message - assuming key is sufficient
             key: z.object({ id: z.string() }).describe("Key of the message to quote (use message ID).")
          }).optional().describe("Message to quote."),
          mentionsEveryOne: z.boolean().optional().default(false).describe("Mention everyone in the group."),
          mentioned: z.array(z.string()).optional().describe("List of JIDs to mention."),
      }).optional()
    }),
    send_media: z.object({
      number: z.string().describe("Recipient's phone number or group JID."),
      mediatype: z.enum(["image", "video", "document"]).describe("Type of media."),
      mimetype: z.string().optional().describe("MIME type of the media (e.g., image/png, video/mp4). Required if not obvious from URL/base64."),
      media: z.string().describe("URL or Base64 encoded string of the media."),
      caption: z.string().optional().describe("Caption for the media."),
      fileName: z.string().optional().describe("Filename for the media (especially for documents)."),
      options: z.object({
          delay: z.number().optional().describe("Delay in milliseconds before sending."),
          quoted: z.object({ key: z.object({ id: z.string() }) }).optional().describe("Message to quote (use message ID)."),
          mentioned: z.array(z.string()).optional().describe("List of JIDs to mention."),
      }).optional()
    }),
     send_ptv: z.object({ // Push To Video (Video Note)
        number: z.string().describe("Recipient's phone number or group JID."),
        video: z.string().describe("URL or Base64 encoded string of the video."),
        options: z.object({
            delay: z.number().optional().describe("Delay in milliseconds before sending."),
            quoted: z.object({ key: z.object({ id: z.string() }) }).optional().describe("Message to quote (use message ID)."),
        }).optional()
     }),
     send_whatsapp_audio: z.object({
        number: z.string().describe("Recipient's phone number or group JID."),
        audio: z.string().describe("URL or Base64 encoded string of the audio (e.g., mp3, ogg)."),
        options: z.object({
            delay: z.number().optional().describe("Delay in milliseconds before sending."),
            quoted: z.object({ key: z.object({ id: z.string() }) }).optional().describe("Message to quote (use message ID)."),
            encoding: z.boolean().optional().describe("Force encoding to WhatsApp audio format?"),
        }).optional()
     }),
    send_sticker: z.object({
      number: z.string().describe("Recipient's phone number or group JID."),
      sticker: z.string().describe("URL or Base64 encoded string of the sticker (e.g., webp, png, jpg)."),
       options: z.object({
          delay: z.number().optional().describe("Delay in milliseconds before sending."),
          quoted: z.object({ key: z.object({ id: z.string() }) }).optional().describe("Message to quote (use message ID)."),
          mentioned: z.array(z.string()).optional().describe("List of JIDs to mention."),
      }).optional()
    }),
    send_location: z.object({
      number: z.string().describe("Recipient's phone number or group JID."),
      latitude: z.number().describe("Latitude coordinate."),
      longitude: z.number().describe("Longitude coordinate."),
      name: z.string().optional().describe("Name of the location."),
      address: z.string().optional().describe("Address of the location."),
       options: z.object({
          delay: z.number().optional().describe("Delay in milliseconds before sending."),
          quoted: z.object({ key: z.object({ id: z.string() }) }).optional().describe("Message to quote (use message ID)."),
       }).optional()
    }),
    send_contact: z.object({
      number: z.string().describe("Recipient's phone number or group JID."),
      contacts: z.array(z.object({
        fullName: z.string().describe("Full name of the contact."),
        wuid: z.string().describe("WhatsApp User ID (phone number with country code)."),
        phoneNumber: z.string().describe("Formatted phone number."),
        organization: z.string().optional().describe("Organization name."),
        email: z.string().optional().describe("Email address."),
        url: z.string().optional().describe("Website URL.")
      })).describe("Array of contacts to send."),
       options: z.object({
          delay: z.number().optional().describe("Delay in milliseconds before sending."),
          quoted: z.object({ key: z.object({ id: z.string() }) }).optional().describe("Message to quote (use message ID)."),
       }).optional()
    }),
    send_reaction: z.object({
      key: z.object({
        remoteJid: z.string().describe("JID of the chat where the message is."),
        fromMe: z.boolean().describe("Was the message sent by the bot/instance?"),
        id: z.string().describe("The ID of the message to react to.")
      }).describe("Key object identifying the message."),
      reaction: z.string().describe("The emoji reaction (e.g., '👍', '❤️', '🚀'). Empty string to remove reaction.")
    }),
    send_poll: z.object({
        number: z.string().describe("Recipient's phone number or group JID."),
        name: z.string().describe("The main question or text of the poll."),
        selectableCount: z.number().int().min(1).default(1).describe("How many options can be selected."),
        values: z.array(z.string()).min(1).describe("List of poll options/answers."),
        options: z.object({
            delay: z.number().optional().describe("Delay in milliseconds before sending."),
            quoted: z.object({ key: z.object({ id: z.string() }) }).optional().describe("Message to quote (use message ID)."),
        }).optional()
    }),
     send_list: z.object({
        number: z.string().describe("Recipient's phone number or group JID."),
        title: z.string().describe("Title of the list message."),
        description: z.string().describe("Description shown below the title."),
        buttonText: z.string().describe("Text for the button that opens the list."),
        footerText: z.string().optional().describe("Footer text for the list."),
        sections: z.array(z.object({
            title: z.string().describe("Title for this section of the list."),
            rows: z.array(z.object({
                title: z.string().describe("Title of the list row/item."),
                description: z.string().optional().describe("Description for the list row/item."),
                rowId: z.string().describe("Unique ID for this row (sent back when user selects it).")
            })).min(1).describe("Rows within this section.")
        })).min(1).describe("Sections of the list message."),
        options: z.object({
            delay: z.number().optional().describe("Delay in milliseconds before sending."),
            quoted: z.object({ key: z.object({ id: z.string() }) }).optional().describe("Message to quote (use message ID)."),
        }).optional()
     }),
     send_buttons: z.object({
        number: z.string().describe("Recipient's phone number or group JID."),
        title: z.string().optional().describe("Title of the button message (often used for media)."),
        description: z.string().describe("Main text/description of the button message."),
        footer: z.string().optional().describe("Footer text."),
        // Note: Media (image/video) can often be included with buttons, but the API structure might vary.
        // This schema focuses on text-based buttons as per the example. Add media fields if needed.
        buttons: z.array(z.object({
            type: z.enum(["reply", "url", "call", "copy", "pix"]).describe("Type of button."),
            displayText: z.string().describe("Text displayed on the button."),
            // Specific fields based on type
            id: z.string().optional().describe("ID for 'reply' button (sent back on click)."),
            url: z.string().optional().describe("URL for 'url' button."),
            phoneNumber: z.string().optional().describe("Phone number for 'call' button."),
            copyCode: z.string().optional().describe("Text to copy for 'copy' button."),
            // PIX fields (optional)
            currency: z.string().optional().describe("Currency for 'pix' (e.g., BRL)."),
            name: z.string().optional().describe("Recipient name for 'pix'."),
            keyType: z.enum(["phone", "email", "cpf", "cnpj", "random"]).optional().describe("PIX key type."),
            key: z.string().optional().describe("PIX key value.")
        })).min(1).max(3).describe("Buttons to include (max 3 typical)."), // WhatsApp usually limits buttons
        options: z.object({
            delay: z.number().optional().describe("Delay in milliseconds before sending."),
            quoted: z.object({ key: z.object({ id: z.string() }) }).optional().describe("Message to quote (use message ID)."),
        }).optional()
     }),

    // --- Chat ---
    check_whatsapp_numbers: z.object({
      numbers: z.array(z.string()).min(1).describe("Array of phone numbers (with country code) to check.")
    }),
     mark_message_as_read: z.object({
        readMessages: z.array(z.object({
            remoteJid: z.string().describe("JID of the chat."),
            fromMe: z.boolean().describe("Was the message sent by the bot?"),
            id: z.string().describe("ID of the message to mark as read.")
        })).min(1).describe("List of message keys to mark as read.")
     }),
     archive_chat: z.object({
        chat: z.string().describe("JID of the chat to archive/unarchive."),
        archive: z.boolean().describe("Set to true to archive, false to unarchive."),
        // `lastMessage` key might be needed by some API versions, add if required
        // lastMessage: z.object({ key: z.object({ remoteJid: z.string(), fromMe: z.boolean(), id: z.string() }) }).optional()
     }),
     mark_chat_unread: z.object({
        chat: z.string().describe("JID of the chat to mark as unread.")
        // `lastMessage` key might be needed by some API versions, add if required
     }),
    delete_message: z.object({
      key: z.object({
          id: z.string().describe("The ID of the message to delete."),
          remoteJid: z.string().describe("JID of the chat where the message is."),
          fromMe: z.boolean().describe("Was the message sent by the bot/instance?"),
          participant: z.string().optional().describe("Participant JID (required for deleting messages in groups sent by others, if allowed).")
      }).describe("Key identifying the message to delete for everyone.")
    }),
    fetch_profile_picture_url: z.object({
      number: z.string().describe("Phone number (with country code) or JID of the user/group.")
    }),
    get_base64_from_media_message: z.object({
       messageKey: z.object({ // Using messageKey instead of full message object for simplicity
           id: z.string().describe("The ID of the media message."),
           remoteJid: z.string().describe("JID of the chat where the message is."),
           fromMe: z.boolean().describe("Was the message sent by the bot/instance?")
           // participant might be needed for group messages
       }).describe("Key identifying the media message."),
       convertToMp4: z.boolean().optional().default(false).describe("Convert audio to MP4 format?")
    }),
    update_message: z.object({
       key: z.object({
           id: z.string().describe("The ID of the message to edit."),
           remoteJid: z.string().describe("JID of the chat where the message is."),
           fromMe: z.boolean().refine(val => val === true, { message: "Can only edit messages sent by the bot (fromMe must be true)." }).describe("Must be true (bot sent the message)."),
       }).describe("Key identifying the message to edit."),
       text: z.string().describe("The new text content for the message.")
    }),
    send_presence: z.object({
        number: z.string().describe("Chat JID (user or group) to send presence update to."),
        presence: z.enum(["unavailable", "available", "composing", "recording", "paused"]).describe("Type of presence update."),
        delay: z.number().optional().default(1200).describe("Delay in milliseconds (useful for composing/recording).")
    }),
    update_block_status: z.object({
        number: z.string().describe("Phone number (with country code) or JID to block/unblock."),
        status: z.enum(["block", "unblock"]).describe("Action to perform.")
    }),
    find_contacts: z.object({
      // Optional filtering - adapt based on API capabilities if needed
      // where: z.object({ id: z.string().optional() }).optional().describe("Filter criteria (e.g., by JID).")
    }),
    find_messages: z.object({
      where: z.object({
        key: z.object({
          remoteJid: z.string().optional().describe("Filter by chat JID."),
          fromMe: z.boolean().optional().describe("Filter by sender (bot or other)."),
          id: z.string().optional().describe("Find specific message by ID.")
        }).optional()
        // Add other potential filter fields like messageType, messageTimestamp etc. if supported
      }).optional().describe("Criteria to filter messages."),
      page: z.number().int().positive().optional().default(1).describe("Page number for pagination."),
      limit: z.number().int().positive().optional().default(10).describe("Number of messages per page.") // Renamed from 'offset' for clarity as limit
    }),
     fetch_profile: z.object({
        number: z.string().describe("Phone number (with country code) or JID of the user/group.")
     }),
     update_profile_name: z.object({
        name: z.string().describe("The new profile name for the bot instance.")
     }),
     update_profile_status: z.object({
        status: z.string().describe("The new profile status (about/bio) for the bot instance.")
     }),
     update_profile_picture: z.object({
        picture: z.string().describe("URL or Base64 encoded string of the new profile picture.")
     }),
     remove_profile_picture: z.object({
        // No parameters needed
     }),

    // --- Group ---
    create_group: z.object({
      subject: z.string().describe("The name/subject of the new group."),
      description: z.string().optional().describe("Optional description for the group."),
      participants: z.array(z.string()).min(1).describe("Array of phone numbers (with country code) of initial participants.")
    }),
    fetch_all_groups: z.object({
      getParticipants: z.boolean().optional().default(false).describe("Include participant lists in the response?")
    }),
    find_participants: z.object({ // Renamed from busca_participantes_grupo
      groupJid: z.string().describe("The JID of the group (e.g., 1234567890@g.us).")
    }),
    update_participant: z.object({
        groupJid: z.string().describe("The JID of the group."),
        action: z.enum(["add", "remove", "promote", "demote"]).describe("Action to perform on participants."),
        participants: z.array(z.string()).min(1).describe("Array of participant phone numbers (with country code) or JIDs.")
    }),
    update_group_subject: z.object({
        groupJid: z.string().describe("The JID of the group."),
        subject: z.string().describe("The new subject/name for the group.")
    }),
    update_group_description: z.object({
        groupJid: z.string().describe("The JID of the group."),
        description: z.string().describe("The new description for the group.")
    }),
    update_group_picture: z.object({
        groupJid: z.string().describe("The JID of the group."),
        image: z.string().describe("URL or Base64 encoded string of the new group picture.")
    }),
     fetch_invite_code: z.object({
        groupJid: z.string().describe("The JID of the group.")
     }),
     revoke_invite_code: z.object({
        groupJid: z.string().describe("The JID of the group.")
     }),
     send_invite: z.object({
        groupJid: z.string().describe("The JID of the group to invite to."),
        numbers: z.array(z.string()).min(1).describe("Array of phone numbers (with country code) or JIDs to send the invite link to."),
        description: z.string().optional().describe("Optional text to send along with the invite link.")
     }),
     find_group_by_invite_code: z.object({
        inviteCode: z.string().describe("The group invite code (from the invite link).")
     }),
     find_group_by_jid: z.object({
        groupJid: z.string().describe("The JID of the group.")
     }),
     update_group_setting: z.object({
        groupJid: z.string().describe("The JID of the group."),
        action: z.enum(["announcement", "not_announcement", "locked", "unlocked"]).describe("'announcement' (only admins send msg), 'not_announcement' (all send msg), 'locked' (only admins edit info), 'unlocked' (all edit info).")
     }),
     toggle_ephemeral: z.object({
        groupJid: z.string().describe("The JID of the group."),
        expiration: z.enum([0, 86400, 604800, 7776000]).describe("Ephemeral message duration: 0 (Off), 86400 (24h), 604800 (7d), 7776000 (90d).")
     }),
     leave_group: z.object({
        groupJid: z.string().describe("The JID of the group to leave.")
     }),
     // --- Webhook (Example - Find only) ---
     find_webhook_settings: z.object({
        // No parameters needed
     }),
  },
};

// --- Tool Definitions for MCP ---
const TOOL_DEFINITIONS = [
  // --- Instance ---
  {
    name: "create_instance",
    description: "Creates a new Evolution API instance.",
    inputSchema: {
      type: "object",
      properties: {
        instanceName: { type: "string", description: "Unique name for the new instance." },
        token: { type: "string", description: "Optional predefined token (API key)." },
        qrcode: { type: "boolean", description: "Return QR code?", default: true },
      },
      required: ["instanceName"],
    },
  },
  {
    name: "fetch_instances",
    description: "Retrieves a list of all instances or filters by name/ID.",
    inputSchema: {
      type: "object",
      properties: {
        instanceName: { type: "string", description: "Filter by instance name." },
        instanceId: { type: "string", description: "Filter by instance ID." },
      },
      required: [],
    },
  },
  {
    name: "connect_instance",
    description: "Gets the connection QR code or status for the specified instance.",
    inputSchema: { type: "object", properties: {}, required: [] }, // Instance name from global env
  },
  {
    name: "restart_instance",
    description: "Restarts the specified instance.",
    inputSchema: { type: "object", properties: {}, required: [] }, // Instance name from global env
  },
  {
    name: "set_presence",
    description: "Sets the presence status (available/unavailable) for the instance.",
    inputSchema: {
      type: "object",
      properties: {
        presence: { type: "string", enum: ["available", "unavailable"], description: "Presence status." }
      },
      required: ["presence"],
    },
  },
  {
    name: "get_connection_state",
    description: "Gets the current connection state of the instance.",
    inputSchema: { type: "object", properties: {}, required: [] }, // Instance name from global env
  },
  {
    name: "logout_instance",
    description: "Logs out the specified instance from WhatsApp Web.",
    inputSchema: { type: "object", properties: {}, required: [] }, // Instance name from global env
  },
  {
    name: "delete_instance",
    description: "Deletes the specified instance.",
    inputSchema: { type: "object", properties: {}, required: [] }, // Instance name from global env
  },

  // --- Settings ---
  {
    name: "set_settings",
    description: "Updates the settings for the instance.",
    inputSchema: {
        type: "object",
        properties: {
            rejectCall: { type: "boolean", description: "Reject incoming calls?" },
            msgCall: { type: "string", description: "Message for rejected calls." },
            groupsIgnore: { type: "boolean", description: "Ignore group messages?" },
            alwaysOnline: { type: "boolean", description: "Set always online?" },
            readMessages: { type: "boolean", description: "Mark messages as read?" },
            syncFullHistory: { type: "boolean", description: "Sync full history?" },
            readStatus: { type: "boolean", description: "Mark status as seen?" }
        },
        required: [], // All settings are optional updates
    },
  },
  {
      name: "find_settings",
      description: "Retrieves the current settings for the instance.",
      inputSchema: { type: "object", properties: {}, required: [] },
  },

  // --- Send Message ---
  {
    name: "send_text",
    description: "Sends a text message via Evolution API.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "string", description: "Recipient phone number (e.g., 551199...) or group JID." },
        text: { type: "string", description: "Message text." },
        options: {
            type: "object",
            properties: {
                delay: { type: "integer", description: "Delay in ms." },
                quoted: { type: "object", properties: { key: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }, description: "Message key ID to quote." },
                mentioned: { type: "array", items: { type: "string" }, description: "List of JIDs to mention." }
            },
            required: [],
        }
      },
      required: ["number", "text"],
    },
  },
  {
    name: "send_media",
    description: "Sends a media message (image, video, document) via URL or Base64.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "string", description: "Recipient phone number or group JID." },
        mediatype: { type: "string", enum: ["image", "video", "document"], description: "Type of media." },
        mimetype: { type: "string", description: "MIME type (e.g., image/png)." },
        media: { type: "string", description: "URL or Base64 data of the media." },
        caption: { type: "string", description: "Caption for the media." },
        fileName: { type: "string", description: "Filename for the media." },
        options: {
            type: "object",
            properties: {
                delay: { type: "integer", description: "Delay in ms." },
                quoted: { type: "object", properties: { key: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }, description: "Message key ID to quote." },
                mentioned: { type: "array", items: { type: "string" }, description: "List of JIDs to mention." }
            },
            required: [],
        }
      },
      required: ["number", "mediatype", "media"],
    },
  },
  {
    name: "send_ptv",
    description: "Sends a PTV (Push-To-Video) / Video Note message.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "string", description: "Recipient phone number or group JID." },
        video: { type: "string", description: "URL or Base64 data of the video." },
        options: {
            type: "object",
            properties: {
                delay: { type: "integer", description: "Delay in ms." },
                quoted: { type: "object", properties: { key: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }, description: "Message key ID to quote." },
            },
            required: [],
        }
      },
      required: ["number", "video"],
    },
  },
  {
    name: "send_whatsapp_audio",
    description: "Sends an audio message as a voice note.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "string", description: "Recipient phone number or group JID." },
        audio: { type: "string", description: "URL or Base64 data of the audio." },
        options: {
            type: "object",
            properties: {
                delay: { type: "integer", description: "Delay in ms." },
                quoted: { type: "object", properties: { key: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }, description: "Message key ID to quote." },
                encoding: { type: "boolean", description: "Force encoding?" },
            },
            required: [],
        }
      },
      required: ["number", "audio"],
    },
  },
  {
    name: "send_sticker",
    description: "Sends a sticker message via URL or Base64.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "string", description: "Recipient phone number or group JID." },
        sticker: { type: "string", description: "URL or Base64 data of the sticker." },
        options: {
            type: "object",
            properties: {
                delay: { type: "integer", description: "Delay in ms." },
                quoted: { type: "object", properties: { key: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }, description: "Message key ID to quote." },
            },
            required: [],
        }
      },
      required: ["number", "sticker"],
    },
  },
  {
    name: "send_location",
    description: "Sends a location message.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "string", description: "Recipient phone number or group JID." },
        latitude: { type: "number", description: "Latitude." },
        longitude: { type: "number", description: "Longitude." },
        name: { type: "string", description: "Location name." },
        address: { type: "string", description: "Location address." },
         options: {
            type: "object",
            properties: {
                delay: { type: "integer", description: "Delay in ms." },
                quoted: { type: "object", properties: { key: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }, description: "Message key ID to quote." },
            },
            required: [],
        }
      },
      required: ["number", "latitude", "longitude"],
    },
  },
  {
    name: "send_contact",
    description: "Sends one or more contact cards.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "string", description: "Recipient phone number or group JID." },
        contacts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fullName: { type: "string", description: "Contact's full name." },
              wuid: { type: "string", description: "Contact's WhatsApp number (e.g., 5511...)."},
              phoneNumber: { type: "string", description: "Formatted phone number." },
              organization: { type: "string", description: "Organization." },
              email: { type: "string", description: "Email." },
              url: { type: "string", description: "Website URL." },
            },
            required: ["fullName", "wuid", "phoneNumber"],
          },
          minItems: 1,
          description: "Array of contact objects.",
        },
        options: {
            type: "object",
            properties: {
                delay: { type: "integer", description: "Delay in ms." },
                quoted: { type: "object", properties: { key: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }, description: "Message key ID to quote." },
            },
            required: [],
        }
      },
      required: ["number", "contacts"],
    },
  },
  {
    name: "send_reaction",
    description: "Sends an emoji reaction to a specific message.",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "object",
          properties: {
            remoteJid: { type: "string", description: "Chat JID." },
            fromMe: { type: "boolean", description: "Was the message sent by the bot?" },
            id: { type: "string", description: "Message ID." },
          },
          required: ["remoteJid", "fromMe", "id"],
        },
        reaction: { type: "string", description: "Emoji to react with (or empty string to remove)." },
      },
      required: ["key", "reaction"],
    },
  },
   {
      name: "send_poll",
      description: "Sends a poll message.",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "string", description: "Recipient phone number or group JID." },
          name: { type: "string", description: "Poll question/text." },
          selectableCount: { type: "integer", minimum: 1, default: 1, description: "Number of selectable options." },
          values: { type: "array", items: { type: "string" }, minItems: 1, description: "List of poll options." },
          options: {
              type: "object",
              properties: {
                  delay: { type: "integer", description: "Delay in ms." },
                  quoted: { type: "object", properties: { key: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }, description: "Message key ID to quote." },
              },
              required: [],
          }
        },
        required: ["number", "name", "values"],
      },
   },
   {
      name: "send_list",
      description: "Sends a list message.",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "string", description: "Recipient phone number or group JID." },
          title: { type: "string", description: "List title." },
          description: { type: "string", description: "List description." },
          buttonText: { type: "string", description: "Text on the button to open the list." },
          footerText: { type: "string", description: "Footer text." },
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Section title." },
                rows: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Row title." },
                      description: { type: "string", description: "Row description." },
                      rowId: { type: "string", description: "Unique ID for the row." },
                    },
                    required: ["title", "rowId"],
                  },
                  minItems: 1,
                  description: "Rows in this section.",
                },
              },
              required: ["title", "rows"],
            },
            minItems: 1,
            description: "Sections of the list.",
          },
          options: {
              type: "object",
              properties: {
                  delay: { type: "integer", description: "Delay in ms." },
                  quoted: { type: "object", properties: { key: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }, description: "Message key ID to quote." },
              },
              required: [],
          }
        },
        required: ["number", "title", "description", "buttonText", "sections"],
      },
   },
   {
       name: "send_buttons",
       description: "Sends a message with interactive buttons.",
       inputSchema: {
           type: "object",
           properties: {
               number: { type: "string", description: "Recipient phone number or group JID." },
               title: { type: "string", description: "Optional title (often for media)." },
               description: { type: "string", description: "Main message text." },
               footer: { type: "string", description: "Footer text." },
               buttons: {
                   type: "array",
                   items: {
                       type: "object",
                       properties: {
                           type: { type: "string", enum: ["reply", "url", "call", "copy", "pix"], description: "Button type." },
                           displayText: { type: "string", description: "Button label." },
                           id: { type: "string", description: "ID for 'reply' button." },
                           url: { type: "string", description: "URL for 'url' button." },
                           phoneNumber: { type: "string", description: "Phone for 'call' button." },
                           copyCode: { type: "string", description: "Text for 'copy' button." },
                           currency: { type: "string", description: "Currency for 'pix'." },
                           name: { type: "string", description: "Recipient name for 'pix'." },
                           keyType: { type: "string", enum: ["phone", "email", "cpf", "cnpj", "random"], description: "PIX key type." },
                           key: { type: "string", description: "PIX key value." }
                       },
                       required: ["type", "displayText"] // Required fields common to all types
                   },
                   minItems: 1,
                   maxItems: 3, // Typical WhatsApp limit
                   description: "Array of button objects."
               },
               options: {
                    type: "object",
                    properties: {
                        delay: { type: "integer", description: "Delay in ms." },
                        quoted: { type: "object", properties: { key: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }, description: "Message key ID to quote." },
                    },
                    required: [],
                }
           },
           required: ["number", "description", "buttons"],
       },
   },

  // --- Chat ---
  {
    name: "check_whatsapp_numbers",
    description: "Checks if a list of phone numbers have active WhatsApp accounts.",
    inputSchema: {
      type: "object",
      properties: {
        numbers: { type: "array", items: { type: "string" }, minItems: 1, description: "Array of numbers to check." }
      },
      required: ["numbers"],
    },
  },
  {
    name: "mark_message_as_read",
    description: "Marks specific messages as read.",
    inputSchema: {
        type: "object",
        properties: {
            readMessages: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        remoteJid: { type: "string", description: "Chat JID." },
                        fromMe: { type: "boolean", description: "Sent by bot?" },
                        id: { type: "string", description: "Message ID." }
                    },
                    required: ["remoteJid", "fromMe", "id"]
                },
                minItems: 1,
                description: "List of message keys."
            }
        },
        required: ["readMessages"]
    }
  },
  {
    name: "archive_chat",
    description: "Archives or unarchives a specific chat.",
    inputSchema: {
        type: "object",
        properties: {
            chat: { type: "string", description: "Chat JID to (un)archive." },
            archive: { type: "boolean", description: "True to archive, false to unarchive." }
        },
        required: ["chat", "archive"]
    }
  },
  {
    name: "mark_chat_unread",
    description: "Marks a chat as unread.",
    inputSchema: {
        type: "object",
        properties: {
            chat: { type: "string", description: "Chat JID to mark unread." }
        },
        required: ["chat"]
    }
  },
  {
    name: "delete_message",
    description: "Deletes a message for everyone.",
    inputSchema: {
      type: "object",
      properties: {
        key: {
            type: "object",
            properties: {
                id: { type: "string", description: "Message ID." },
                remoteJid: { type: "string", description: "Chat JID." },
                fromMe: { type: "boolean", description: "Was message sent by the bot?" },
                participant: { type: "string", description: "Participant JID (for groups)." }
            },
            required: ["id", "remoteJid", "fromMe"]
        }
      },
      required: ["key"],
    },
  },
  {
    name: "fetch_profile_picture_url",
    description: "Gets the URL of a user's or group's profile picture.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "string", description: "User/Group phone number or JID." }
      },
      required: ["number"],
    },
  },
  {
      name: "get_base64_from_media_message",
      description: "Downloads and returns the Base64 content of a media message.",
      inputSchema: {
          type: "object",
          properties: {
              messageKey: {
                   type: "object",
                   properties: {
                       id: { type: "string", description: "Message ID." },
                       remoteJid: { type: "string", description: "Chat JID." },
                       fromMe: { type: "boolean", description: "Sent by bot?" }
                   },
                   required: ["id", "remoteJid", "fromMe"]
              },
              convertToMp4: { type: "boolean", default: false, description: "Convert audio to MP4?" }
          },
          required: ["messageKey"]
      }
  },
   {
      name: "update_message",
      description: "Edits the text content of a previously sent message.",
      inputSchema: {
          type: "object",
          properties: {
               key: {
                   type: "object",
                   properties: {
                       id: { type: "string", description: "Message ID to edit." },
                       remoteJid: { type: "string", description: "Chat JID." },
                       fromMe: { type: "boolean", description: "Must be true (bot sent it)." }
                   },
                   required: ["id", "remoteJid", "fromMe"]
              },
              text: { type: "string", description: "New message text." }
          },
          required: ["key", "text"]
      }
   },
   {
      name: "send_presence",
      description: "Sends a presence update (e.g., typing, recording) to a chat.",
      inputSchema: {
          type: "object",
          properties: {
              number: { type: "string", description: "Chat JID." },
              presence: { type: "string", enum: ["unavailable", "available", "composing", "recording", "paused"], description: "Presence type." },
              delay: { type: "integer", default: 1200, description: "Duration in ms." }
          },
          required: ["number", "presence"]
      }
   },
   {
      name: "update_block_status",
      description: "Blocks or unblocks a specific contact.",
      inputSchema: {
          type: "object",
          properties: {
              number: { type: "string", description: "User JID or number to (un)block." },
              status: { type: "string", enum: ["block", "unblock"], description: "Action." }
          },
          required: ["number", "status"]
      }
   },
   {
       name: "find_contacts",
       description: "Retrieves the list of contacts synced with the instance.",
       inputSchema: { type: "object", properties: {}, required: [] } // Add filters if needed/supported
   },
   {
       name: "find_messages",
       description: "Searches for messages in the instance's database (if enabled).",
       inputSchema: {
           type: "object",
           properties: {
               where: {
                   type: "object",
                   properties: {
                       key: {
                           type: "object",
                           properties: {
                               remoteJid: { type: "string", description: "Filter by chat JID." },
                               fromMe: { type: "boolean", description: "Filter by sender." },
                               id: { type: "string", description: "Find by message ID." }
                           },
                           required: []
                       }
                       // Add other filter fields here
                   },
                   required: []
               },
               page: { type: "integer", default: 1, description: "Page number." },
               limit: { type: "integer", default: 10, description: "Messages per page." }
           },
           required: []
       }
   },
    {
      name: "fetch_profile",
      description: "Gets profile information (name, status, picture) for a given number/JID.",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "string", description: "User/Group phone number or JID." }
        },
        required: ["number"],
      },
    },
    {
      name: "update_profile_name",
      description: "Updates the instance's profile name.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "New profile name." }
        },
        required: ["name"],
      },
    },
    {
      name: "update_profile_status",
      description: "Updates the instance's profile status (about/bio).",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "New profile status." }
        },
        required: ["status"],
      },
    },
    {
      name: "update_profile_picture",
      description: "Updates the instance's profile picture from a URL or Base64.",
      inputSchema: {
        type: "object",
        properties: {
          picture: { type: "string", description: "URL or Base64 of the new picture." }
        },
        required: ["picture"],
      },
    },
    {
      name: "remove_profile_picture",
      description: "Removes the instance's current profile picture.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },


  // --- Group ---
  {
    name: "create_group",
    description: "Creates a new WhatsApp group.",
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Group name." },
        description: { type: "string", description: "Group description." },
        participants: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          description: "Array of initial participant numbers (e.g., 5511...)."
        },
      },
      required: ["subject", "participants"],
    },
  },
  {
    name: "fetch_all_groups",
    description: "Retrieves a list of all groups the instance is part of.",
    inputSchema: {
      type: "object",
      properties: {
        getParticipants: { type: "boolean", description: "Include participants?", default: false },
      },
      required: [],
    },
  },
  {
    name: "find_participants",
    description: "Retrieves the participant list for a specific group.",
    inputSchema: {
      type: "object",
      properties: {
        groupJid: { type: "string", description: "Group JID (e.g., 123@g.us)." },
      },
      required: ["groupJid"],
    },
  },
   {
       name: "update_participant",
       description: "Adds, removes, promotes, or demotes participants in a group.",
       inputSchema: {
           type: "object",
           properties: {
               groupJid: { type: "string", description: "Group JID." },
               action: { type: "string", enum: ["add", "remove", "promote", "demote"], description: "Action." },
               participants: { type: "array", items: { type: "string" }, minItems: 1, description: "Participant numbers or JIDs." }
           },
           required: ["groupJid", "action", "participants"]
       }
   },
   {
       name: "update_group_subject",
       description: "Changes the subject (name) of a group.",
       inputSchema: {
           type: "object",
           properties: {
               groupJid: { type: "string", description: "Group JID." },
               subject: { type: "string", description: "New group subject." }
           },
           required: ["groupJid", "subject"]
       }
   },
   {
       name: "update_group_description",
       description: "Changes the description of a group.",
       inputSchema: {
           type: "object",
           properties: {
               groupJid: { type: "string", description: "Group JID." },
               description: { type: "string", description: "New group description." }
           },
           required: ["groupJid", "description"]
       }
   },
   {
       name: "update_group_picture",
       description: "Changes the profile picture of a group.",
       inputSchema: {
           type: "object",
           properties: {
               groupJid: { type: "string", description: "Group JID." },
               image: { type: "string", description: "URL or Base64 of the new picture." }
           },
           required: ["groupJid", "image"]
       }
   },
    {
      name: "fetch_invite_code",
      description: "Gets the current invite code (link) for a group.",
      inputSchema: {
        type: "object",
        properties: {
          groupJid: { type: "string", description: "Group JID." },
        },
        required: ["groupJid"],
      },
    },
    {
      name: "revoke_invite_code",
      description: "Generates a new invite code (link), invalidating the old one.",
      inputSchema: {
        type: "object",
        properties: {
          groupJid: { type: "string", description: "Group JID." },
        },
        required: ["groupJid"],
      },
    },
    {
      name: "send_invite",
      description: "Sends the group invite link to specified numbers.",
      inputSchema: {
        type: "object",
        properties: {
          groupJid: { type: "string", description: "Group JID to invite to." },
          numbers: { type: "array", items: { type: "string" }, minItems: 1, description: "Numbers/JIDs to send the link to." },
          description: { type: "string", description: "Optional text accompanying the link." },
        },
        required: ["groupJid", "numbers"],
      },
    },
    {
      name: "find_group_by_invite_code",
      description: "Retrieves group information using an invite code.",
      inputSchema: {
        type: "object",
        properties: {
          inviteCode: { type: "string", description: "The invite code from the link." },
        },
        required: ["inviteCode"],
      },
    },
    {
      name: "find_group_by_jid",
      description: "Retrieves detailed information about a specific group by its JID.",
      inputSchema: {
        type: "object",
        properties: {
          groupJid: { type: "string", description: "Group JID." },
        },
        required: ["groupJid"],
      },
    },
    {
      name: "update_group_setting",
      description: "Changes group settings (e.g., who can send messages or edit info).",
      inputSchema: {
        type: "object",
        properties: {
          groupJid: { type: "string", description: "Group JID." },
          action: { type: "string", enum: ["announcement", "not_announcement", "locked", "unlocked"], description: "Setting to change." },
        },
        required: ["groupJid", "action"],
      },
    },
    {
      name: "toggle_ephemeral",
      description: "Enables or disables ephemeral (disappearing) messages for a group.",
      inputSchema: {
        type: "object",
        properties: {
          groupJid: { type: "string", description: "Group JID." },
          expiration: { type: "integer", enum: [0, 86400, 604800, 7776000], description: "Duration in seconds (0=off)." },
        },
        required: ["groupJid", "expiration"],
      },
    },
    {
      name: "leave_group",
      description: "Makes the instance leave a specified group.",
      inputSchema: {
        type: "object",
        properties: {
          groupJid: { type: "string", description: "Group JID to leave." },
        },
        required: ["groupJid"],
      },
    },
     // --- Webhook (Example - Find only) ---
     {
       name: "find_webhook_settings",
       description: "Retrieves the current webhook configuration for the instance.",
       inputSchema: { type: "object", properties: {}, required: [] },
     },
];

// --- Tool Handler Implementations ---
const toolHandlers = {
  // --- Instance Handlers ---
  create_instance: async (args) => {
    const parsed = schemas.toolInputs.create_instance.parse(args);
    const apiKey = getEnv("EVOLUTION_APIKEY"); // Use global API key for creation
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080"); // Default if not set

    const url = `https://${apiBase}/instance/create`; // Assuming http for local default, adjust if needed
    console.log(`Calling ${url} with args:`, parsed);

    try {
      const response = await axios.post(url, parsed, {
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      });
      return {
        content: [{ type: "text", text: `Instance creation initiated. Response: ${JSON.stringify(response.data, null, 2)}` }],
      };
    } catch (error) {
       console.error("Error calling create_instance:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error creating instance: ${errorText}` }] };
    }
  },

  fetch_instances: async (args) => {
    const parsed = schemas.toolInputs.fetch_instances.parse(args);
    const apiKey = getEnv("EVOLUTION_APIKEY");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
    const url = `https://${apiBase}/instance/fetchInstances`;
    console.log(`Calling ${url} with query:`, parsed);

    try {
      const response = await axios.get(url, {
        headers: { 'apikey': apiKey },
        params: parsed, // Add query params if any
      });
      return {
        content: [{ type: "text", text: `Instances fetched: ${JSON.stringify(response.data, null, 2)}` }],
      };
    } catch (error) {
       console.error("Error calling fetch_instances:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error fetching instances: ${errorText}` }] };
    }
  },

  connect_instance: async (args) => {
    // args is empty based on schema
    const instanceName = getEnv("EVOLUTION_INSTANCE");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
    // Assuming global apikey is NOT needed for connect, usually instance-specific or none
    const url = `https://${apiBase}/instance/connect/${instanceName}`;
    console.log(`Calling ${url}`);

    try {
      const response = await axios.get(url); // No API key header usually
       let responseText = `Connection status/QR code fetched: ${JSON.stringify(response.data, null, 2)}`;
       if (response.data?.base64) {
           responseText += "\n\n(QR Code base64 data received, cannot display image here)";
       }
      return { content: [{ type: "text", text: responseText }] };
    } catch (error) {
       console.error("Error calling connect_instance:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error connecting instance: ${errorText}` }] };
    }
  },

   restart_instance: async (args) => {
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const apiKey = getEnv("EVOLUTION_APIKEY"); // Restart might need global key
        const url = `https://${apiBase}/instance/restart/${instanceName}`;
        console.log(`Calling ${url}`);

        try {
            const response = await axios.post(url, {}, { // POST with empty body
                headers: { 'apikey': apiKey }
            });
             let responseText = `Instance restart initiated. Response: ${JSON.stringify(response.data, null, 2)}`;
             if (response.data?.base64) { // Restart might also return QR
                 responseText += "\n\n(QR Code base64 data received, cannot display image here)";
             }
            return { content: [{ type: "text", text: responseText }] };
        } catch (error) {
           console.error("Error calling restart_instance:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error restarting instance: ${errorText}` }] };
        }
   },

    set_presence: async (args) => {
        const parsed = schemas.toolInputs.set_presence.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY"); // Assuming instance API key needed
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/instance/setPresence/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);

        try {
            const response = await axios.post(url, parsed, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey }
            });
            return { content: [{ type: "text", text: `Presence set. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling set_presence:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error setting presence: ${errorText}` }] };
        }
    },

    get_connection_state: async (args) => {
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const apiKey = getEnv("EVOLUTION_APIKEY"); // Assuming instance API key needed
        const url = `https://${apiBase}/instance/connectionState/${instanceName}`;
        console.log(`Calling ${url}`);

        try {
            const response = await axios.get(url, {
                headers: { 'apikey': apiKey }
            });
            return { content: [{ type: "text", text: `Connection state: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling get_connection_state:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error getting connection state: ${errorText}` }] };
        }
    },

    logout_instance: async (args) => {
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY"); // Assuming instance API key needed
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/instance/logout/${instanceName}`;
        console.log(`Calling ${url}`);

        try {
            const response = await axios.delete(url, {
                headers: { 'apikey': apiKey }
            });
            return { content: [{ type: "text", text: `Instance logout initiated. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling logout_instance:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error logging out instance: ${errorText}` }] };
        }
    },

    delete_instance: async (args) => {
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY"); // Use global API key for deletion
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/instance/delete/${instanceName}`;
        console.log(`Calling ${url}`);

        try {
            const response = await axios.delete(url, {
                headers: { 'apikey': apiKey }
            });
            return { content: [{ type: "text", text: `Instance deletion initiated. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling delete_instance:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error deleting instance: ${errorText}` }] };
        }
    },

  // --- Settings Handlers ---
  set_settings: async (args) => {
      const parsed = schemas.toolInputs.set_settings.parse(args);
      const instanceName = getEnv("EVOLUTION_INSTANCE");
      const apiKey = getEnv("EVOLUTION_APIKEY");
      const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
      const url = `https://${apiBase}/settings/set/${instanceName}`;
      console.log(`Calling ${url} with args:`, parsed);

      try {
          const response = await axios.post(url, parsed, {
              headers: { 'Content-Type': 'application/json', 'apikey': apiKey }
          });
          return { content: [{ type: "text", text: `Settings updated. Response: ${JSON.stringify(response.data, null, 2)}` }] };
      } catch (error) {
         console.error("Error calling set_settings:", error.response?.data || error.message);
         const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
         return { content: [{ type: "text", text: `Error updating settings: ${errorText}` }] };
      }
  },

  find_settings: async (args) => {
      // No args parsed
      const instanceName = getEnv("EVOLUTION_INSTANCE");
      const apiKey = getEnv("EVOLUTION_APIKEY");
      const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
      const url = `https://${apiBase}/settings/find/${instanceName}`;
      console.log(`Calling ${url}`);

      try {
          const response = await axios.get(url, {
              headers: { 'apikey': apiKey }
          });
          return { content: [{ type: "text", text: `Current settings: ${JSON.stringify(response.data, null, 2)}` }] };
      } catch (error) {
         console.error("Error calling find_settings:", error.response?.data || error.message);
         const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
         return { content: [{ type: "text", text: `Error finding settings: ${errorText}` }] };
      }
  },

  // --- Send Message Handlers ---
  send_text: async (args) => {
    const parsed = schemas.toolInputs.send_text.parse(args);
    const instanceName = getEnv("EVOLUTION_INSTANCE");
    const apiKey = getEnv("EVOLUTION_APIKEY");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");

    const url = `https://${apiBase}/message/sendText/${instanceName}`;
    console.log(`Calling ${url} with args:`, parsed);
    const payload = {
        number: parsed.number,
        text: parsed.text,
        options: parsed.options // Pass validated options directly
    }

    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      });
      return {
        content: [{ type: "text", text: `Text message sent to ${parsed.number}. Response: ${JSON.stringify(response.data, null, 2)}` }],
      };
    } catch (error) {
       console.error("Error calling send_text:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error sending text message: ${errorText}` }] };
    }
  },

  send_media: async (args) => {
    const parsed = schemas.toolInputs.send_media.parse(args);
    const instanceName = getEnv("EVOLUTION_INSTANCE");
    const apiKey = getEnv("EVOLUTION_APIKEY");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
    const url = `https://${apiBase}/message/sendMedia/${instanceName}`;
     console.log(`Calling ${url} with args:`, parsed);
     const payload = {
         number: parsed.number,
         options: parsed.options, // Pass validated options
         media: {
             mediatype: parsed.mediatype,
             mimetype: parsed.mimetype,
             media: parsed.media, // URL or Base64
             caption: parsed.caption,
             fileName: parsed.fileName
         }
     };


    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      });
      return {
        content: [{ type: "text", text: `Media message (${parsed.mediatype}) sent to ${parsed.number}. Response: ${JSON.stringify(response.data, null, 2)}` }],
      };
    } catch (error) {
       console.error("Error calling send_media:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error sending media message: ${errorText}` }] };
    }
  },

  send_ptv: async (args) => {
      const parsed = schemas.toolInputs.send_ptv.parse(args);
      const instanceName = getEnv("EVOLUTION_INSTANCE");
      const apiKey = getEnv("EVOLUTION_APIKEY");
      const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
      const url = `https://${apiBase}/message/sendPtv/${instanceName}`;
      console.log(`Calling ${url} with args:`, parsed);
        const payload = {
            number: parsed.number,
            options: parsed.options,
            media: { // PTV often uses a nested media structure too
                media: parsed.video,
                mediatype: "video" // Assuming PTV is always video type
            }
        };

      try {
          const response = await axios.post(url, payload, {
              headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
          });
          return { content: [{ type: "text", text: `PTV sent to ${parsed.number}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
      } catch (error) {
         console.error("Error calling send_ptv:", error.response?.data || error.message);
         const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
         return { content: [{ type: "text", text: `Error sending PTV: ${errorText}` }] };
      }
  },

  send_whatsapp_audio: async (args) => {
      const parsed = schemas.toolInputs.send_whatsapp_audio.parse(args);
      const instanceName = getEnv("EVOLUTION_INSTANCE");
      const apiKey = getEnv("EVOLUTION_APIKEY");
      const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
      const url = `https://${apiBase}/message/sendWhatsAppAudio/${instanceName}`;
      console.log(`Calling ${url} with args:`, parsed);
        const payload = {
            number: parsed.number,
            options: parsed.options,
            media: { // Audio often uses a nested media structure too
                media: parsed.audio,
                mediatype: "audio"
            }
        };

      try {
          const response = await axios.post(url, payload, {
              headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
          });
          return { content: [{ type: "text", text: `WhatsApp Audio sent to ${parsed.number}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
      } catch (error) {
         console.error("Error calling send_whatsapp_audio:", error.response?.data || error.message);
         const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
         return { content: [{ type: "text", text: `Error sending WhatsApp audio: ${errorText}` }] };
      }
  },

  send_sticker: async (args) => {
    const parsed = schemas.toolInputs.send_sticker.parse(args);
    const instanceName = getEnv("EVOLUTION_INSTANCE");
    const apiKey = getEnv("EVOLUTION_APIKEY");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
    const url = `https://${apiBase}/message/sendSticker/${instanceName}`;
     console.log(`Calling ${url} with args:`, parsed);
        const payload = {
            number: parsed.number,
            options: parsed.options,
            media: { // Sticker often uses a nested media structure too
                media: parsed.sticker,
                mediatype: "sticker"
            }
        };

    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      });
      return {
        content: [{ type: "text", text: `Sticker sent to ${parsed.number}. Response: ${JSON.stringify(response.data, null, 2)}` }],
      };
    } catch (error) {
       console.error("Error calling send_sticker:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error sending sticker: ${errorText}` }] };
    }
  },

  send_location: async (args) => {
    const parsed = schemas.toolInputs.send_location.parse(args);
    const instanceName = getEnv("EVOLUTION_INSTANCE");
    const apiKey = getEnv("EVOLUTION_APIKEY");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
    const url = `https://${apiBase}/message/sendLocation/${instanceName}`;
    console.log(`Calling ${url} with args:`, parsed);
    const payload = {
        number: parsed.number,
        options: parsed.options,
        location: {
            degreesLatitude: parsed.latitude,
            degreesLongitude: parsed.longitude,
            name: parsed.name,
            address: parsed.address
        }
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      });
      return {
        content: [{ type: "text", text: `Location sent to ${parsed.number}. Response: ${JSON.stringify(response.data, null, 2)}` }],
      };
    } catch (error) {
       console.error("Error calling send_location:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error sending location: ${errorText}` }] };
    }
  },

  send_contact: async (args) => {
    const parsed = schemas.toolInputs.send_contact.parse(args);
    const instanceName = getEnv("EVOLUTION_INSTANCE");
    const apiKey = getEnv("EVOLUTION_APIKEY");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
    const url = `https://${apiBase}/message/sendContact/${instanceName}`;
    console.log(`Calling ${url} with args:`, parsed);
    const payload = {
        number: parsed.number,
        options: parsed.options,
        contactMessage: { // Structure often involves a specific key
            contacts: parsed.contacts
        }
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      });
      return {
        content: [{ type: "text", text: `Contact(s) sent to ${parsed.number}. Response: ${JSON.stringify(response.data, null, 2)}` }],
      };
    } catch (error) {
       console.error("Error calling send_contact:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error sending contact: ${errorText}` }] };
    }
  },

  send_reaction: async (args) => {
    const parsed = schemas.toolInputs.send_reaction.parse(args);
    const instanceName = getEnv("EVOLUTION_INSTANCE");
    const apiKey = getEnv("EVOLUTION_APIKEY");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
    const url = `https://${apiBase}/message/sendReaction/${instanceName}`;
    console.log(`Calling ${url} with args:`, parsed);

    try {
      const response = await axios.post(url, { reactionMessage: parsed }, { // API might wrap it
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      });
      return {
        content: [{ type: "text", text: `Reaction '${parsed.reaction}' sent to message ${parsed.key.id}. Response: ${JSON.stringify(response.data, null, 2)}` }],
      };
    } catch (error) {
       console.error("Error calling send_reaction:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error sending reaction: ${errorText}` }] };
    }
  },

   send_poll: async (args) => {
        const parsed = schemas.toolInputs.send_poll.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/message/sendPoll/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);
        const payload = {
            number: parsed.number,
            options: parsed.options,
            poll: {
                name: parsed.name,
                values: parsed.values,
                selectableCount: parsed.selectableCount
            }
        };

        try {
            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `Poll sent to ${parsed.number}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling send_poll:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error sending poll: ${errorText}` }] };
        }
    },

    send_list: async (args) => {
        const parsed = schemas.toolInputs.send_list.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/message/sendList/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);
         const payload = {
            number: parsed.number,
            options: parsed.options,
            listMessage: { // Structure often involves a specific key
                 title: parsed.title,
                 description: parsed.description,
                 buttonText: parsed.buttonText,
                 footerText: parsed.footerText,
                 sections: parsed.sections
            }
         };

        try {
            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `List message sent to ${parsed.number}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling send_list:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error sending list message: ${errorText}` }] };
        }
    },

    send_buttons: async (args) => {
        const parsed = schemas.toolInputs.send_buttons.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/message/sendButtons/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);
         const payload = {
            number: parsed.number,
            options: parsed.options,
            buttonMessage: { // Structure often involves a specific key
                 text: parsed.description, // Map description to text field
                 title: parsed.title,
                 footer: parsed.footer,
                 buttons: parsed.buttons
            }
         };

        try {
            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `Button message sent to ${parsed.number}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling send_buttons:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error sending button message: ${errorText}` }] };
        }
    },

  // --- Chat Handlers ---
  check_whatsapp_numbers: async (args) => {
    const parsed = schemas.toolInputs.check_whatsapp_numbers.parse(args);
    const instanceName = getEnv("EVOLUTION_INSTANCE");
    const apiKey = getEnv("EVOLUTION_APIKEY");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
    const url = `https://${apiBase}/chat/whatsappNumbers/${instanceName}`;
    console.log(`Calling ${url} with args:`, parsed);

    try {
      const response = await axios.post(url, parsed, {
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      });
      return {
        content: [{ type: "text", text: `WhatsApp number check results: ${JSON.stringify(response.data, null, 2)}` }],
      };
    } catch (error) {
       console.error("Error calling check_whatsapp_numbers:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error checking WhatsApp numbers: ${errorText}` }] };
    }
  },

   mark_message_as_read: async (args) => {
        const parsed = schemas.toolInputs.mark_message_as_read.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/markMessageAsRead/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);

        try {
            const response = await axios.post(url, parsed, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `Marked messages as read. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling mark_message_as_read:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error marking messages as read: ${errorText}` }] };
        }
   },

   archive_chat: async (args) => {
        const parsed = schemas.toolInputs.archive_chat.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/archiveChat/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);
         // API might require lastMessage, adjust payload if needed based on testing
         const payload = {
             chatId: parsed.chat, // Map chat to chatId if API expects that
             archive: parsed.archive
         };

        try {
            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            const action = parsed.archive ? 'archived' : 'unarchived';
            return { content: [{ type: "text", text: `Chat ${parsed.chat} ${action}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling archive_chat:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error archiving/unarchiving chat: ${errorText}` }] };
        }
   },

   mark_chat_unread: async (args) => {
        const parsed = schemas.toolInputs.mark_chat_unread.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/markChatUnread/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);
        const payload = { chatId: parsed.chat }; // API might expect chatId

        try {
            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `Chat ${parsed.chat} marked as unread. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling mark_chat_unread:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error marking chat unread: ${errorText}` }] };
        }
   },

  delete_message: async (args) => {
    const parsed = schemas.toolInputs.delete_message.parse(args);
    const instanceName = getEnv("EVOLUTION_INSTANCE");
    const apiKey = getEnv("EVOLUTION_APIKEY");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
    // Note: DELETE requests in Axios typically use the 'data' property for the body
    const url = `https://${apiBase}/chat/deleteMessageForEveryone/${instanceName}`;
     console.log(`Calling ${url} with key:`, parsed.key);

    try {
      const response = await axios.post(url, { message: { key: parsed.key } }, { // Often needs to be wrapped, e.g. { message: { key: ... } } or just { key: ... }
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      });
      return {
        content: [{ type: "text", text: `Message deletion requested for ${parsed.key.id}. Response: ${JSON.stringify(response.data, null, 2)}` }],
      };
    } catch (error) {
       console.error("Error calling delete_message:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error deleting message: ${errorText}` }] };
    }
  },

  fetch_profile_picture_url: async (args) => {
    const parsed = schemas.toolInputs.fetch_profile_picture_url.parse(args);
    const instanceName = getEnv("EVOLUTION_INSTANCE");
    const apiKey = getEnv("EVOLUTION_APIKEY");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
    const url = `https://${apiBase}/chat/fetchProfilePictureUrl/${instanceName}`;
    console.log(`Calling ${url} with args:`, parsed);

    try {
      const response = await axios.post(url, { number: parsed.number }, {
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      });
      return {
        content: [{ type: "text", text: `Profile picture URL for ${parsed.number}: ${JSON.stringify(response.data, null, 2)}` }],
      };
    } catch (error) {
       console.error("Error calling fetch_profile_picture_url:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error fetching profile picture URL: ${errorText}` }] };
    }
  },

    get_base64_from_media_message: async (args) => {
        const parsed = schemas.toolInputs.get_base64_from_media_message.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/getBase64FromMediaMessage/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);
         const payload = {
             message: { key: parsed.messageKey }, // API likely expects the key nested under 'message'
             convertToMp4: parsed.convertToMp4
         };

        try {
            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            // Base64 data can be very long, maybe just confirm success?
             const responseText = response.data?.base64
                 ? `Successfully retrieved Base64 data for message ${parsed.messageKey.id}. (Data too long to display). Mimetype: ${response.data.mimetype}`
                 : `Media retrieval response for message ${parsed.messageKey.id}: ${JSON.stringify(response.data, null, 2)}`;
            return { content: [{ type: "text", text: responseText }] };
        } catch (error) {
           console.error("Error calling get_base64_from_media_message:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error getting media Base64: ${errorText}` }] };
        }
    },

    update_message: async (args) => {
        const parsed = schemas.toolInputs.update_message.parse(args);
         // Additional validation (already in Zod schema, but good practice)
         if (!parsed.key.fromMe) {
              return { content: [{ type: "text", text: "Error: Can only edit messages sent by the bot instance (fromMe must be true)." }] };
         }
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/updateMessage/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);
         const payload = {
             key: parsed.key,
             update: { text: parsed.text } // API might expect update payload nested
         };

        try {
            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `Message ${parsed.key.id} updated. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling update_message:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error updating message: ${errorText}` }] };
        }
    },

    send_presence: async (args) => {
        const parsed = schemas.toolInputs.send_presence.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/sendPresence/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);
         const payload = {
             chatId: parsed.number, // Map number to chatId
             presence: parsed.presence,
             duration: parsed.delay // Map delay to duration if needed
         };

        try {
            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `Presence '${parsed.presence}' sent to ${parsed.number}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling send_presence:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error sending presence: ${errorText}` }] };
        }
    },

    update_block_status: async (args) => {
        const parsed = schemas.toolInputs.update_block_status.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/updateBlockStatus/${instanceName}`; // Note: Path correction if needed
        console.log(`Calling ${url} with args:`, parsed);
         const payload = {
             jid: parsed.number, // Map number to jid
             action: parsed.status // Map status to action
         };

        try {
            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
             const actionText = parsed.status === 'block' ? 'blocked' : 'unblocked';
            return { content: [{ type: "text", text: `Contact ${parsed.number} ${actionText}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling update_block_status:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error updating block status: ${errorText}` }] };
        }
    },

    find_contacts: async (args) => {
        // const parsed = schemas.toolInputs.find_contacts.parse(args); // Parse if filters added
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/findContacts/${instanceName}`;
        console.log(`Calling ${url}`);

        try {
            // Use POST with potentially empty body if required by API, or GET if allowed
            const response = await axios.post(url, {}, { // Assuming POST based on Postman
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `Contacts found: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling find_contacts:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error finding contacts: ${errorText}` }] };
        }
    },

    find_messages: async (args) => {
        const parsed = schemas.toolInputs.find_messages.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/findMessages/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);
        // Adjust payload structure based on API requirements (e.g., pagination outside 'where')
        const payload = {
            where: parsed.where,
            page: parsed.page,
            limit: parsed.limit // Use limit here
            // offset: (parsed.page - 1) * parsed.limit // Calculate offset if API uses it
        };

        try {
            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `Messages found: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling find_messages:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error finding messages: ${errorText}` }] };
        }
    },
     fetch_profile: async (args) => {
        const parsed = schemas.toolInputs.fetch_profile.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/fetchProfile/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);

        try {
            const response = await axios.post(url, { number: parsed.number }, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `Profile for ${parsed.number}: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling fetch_profile:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error fetching profile: ${errorText}` }] };
        }
     },
     update_profile_name: async (args) => {
        const parsed = schemas.toolInputs.update_profile_name.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/updateProfileName/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);

        try {
            const response = await axios.post(url, { name: parsed.name }, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `Profile name updated. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling update_profile_name:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error updating profile name: ${errorText}` }] };
        }
     },
     update_profile_status: async (args) => {
        const parsed = schemas.toolInputs.update_profile_status.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/updateProfileStatus/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);

        try {
            const response = await axios.post(url, { status: parsed.status }, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `Profile status updated. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling update_profile_status:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error updating profile status: ${errorText}` }] };
        }
     },
     update_profile_picture: async (args) => {
        const parsed = schemas.toolInputs.update_profile_picture.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/updateProfilePicture/${instanceName}`;
        console.log(`Calling ${url} with picture URL/Base64`);

        try {
            const response = await axios.post(url, { url: parsed.picture }, { // API might expect { url: ... } or { picture: ... }
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `Profile picture update requested. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling update_profile_picture:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error updating profile picture: ${errorText}` }] };
        }
     },
     remove_profile_picture: async (args) => {
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/chat/removeProfilePicture/${instanceName}`;
        console.log(`Calling ${url}`);

        try {
            const response = await axios.delete(url, {
                headers: { 'apikey': apiKey },
            });
            return { content: [{ type: "text", text: `Profile picture removal requested. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling remove_profile_picture:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error removing profile picture: ${errorText}` }] };
        }
     },

  // --- Group Handlers ---
  create_group: async (args) => {
    // Validate and parse input
    const parsed = schemas.toolInputs.create_group.parse(args);
    const instanceName = getEnv("EVOLUTION_INSTANCE");
    const apiKey = getEnv("EVOLUTION_APIKEY");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
  
    // Construct the URL (the instanceName is appended as per other group endpoints)
    const url = `https://${apiBase}/group/create/${instanceName}`;
    console.log(`Calling ${url} with args:`, parsed);
  
    const payload = {
      subject: parsed.subject,
      description: parsed.description,  // this is optional
      participants: parsed.participants,
    };
  
    try {
      const response = await axios.post(url, payload, {
        headers: {
          "Content-Type": "application/json",
          "apikey": apiKey
        }
      });
      return {
        content: [{
          type: "text",
          text: `Group '${parsed.subject}' creation initiated. Response: ${JSON.stringify(response.data, null, 2)}`
        }]
      };
    } catch (error) {
      console.error("Error calling create_group:", error.response?.data || error.message);
      const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      return { content: [{
        type: "text",
        text: `Error creating group: ${errorText}`
      }] };
    }
  },

  fetch_all_groups: async (args) => {
    const parsed = schemas.toolInputs.fetch_all_groups.parse(args);
    const instanceName = getEnv("EVOLUTION_INSTANCE");
    const apiKey = getEnv("EVOLUTION_APIKEY");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
    const url = `https://${apiBase}/group/fetchAllGroups/${instanceName}`;
    console.log(`Calling ${url} with query:`, parsed);

    try {
      const response = await axios.get(url, {
        headers: { 'apikey': apiKey },
        params: parsed, // Pass getParticipants as query param
      });
      return {
        content: [{ type: "text", text: `Groups fetched: ${JSON.stringify(response.data, null, 2)}` }],
      };
    } catch (error) {
       console.error("Error calling fetch_all_groups:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error fetching groups: ${errorText}` }] };
    }
  },

  find_participants: async (args) => {
    const parsed = schemas.toolInputs.find_participants.parse(args);
    const instanceName = getEnv("EVOLUTION_INSTANCE");
    const apiKey = getEnv("EVOLUTION_APIKEY");
    const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
    const url = `https://${apiBase}/group/participants/${instanceName}`;
    console.log(`Calling ${url} with query:`, parsed);

    try {
      const response = await axios.get(url, {
        headers: { 'apikey': apiKey },
        params: { groupJid: parsed.groupJid }, // Pass groupJid as query param
      });
      return {
        content: [{ type: "text", text: `Participants for group ${parsed.groupJid}: ${JSON.stringify(response.data, null, 2)}` }],
      };
    } catch (error) {
       console.error("Error calling find_participants:", error.response?.data || error.message);
       const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
       return { content: [{ type: "text", text: `Error finding participants: ${errorText}` }] };
    }
  },

   update_participant: async (args) => {
        const parsed = schemas.toolInputs.update_participant.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/group/updateParticipant/${instanceName}`;
        console.log(`Calling ${url} with query and body:`, parsed);
        const payload = {
            action: parsed.action,
            participants: parsed.participants
        };

        try {
            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                params: { groupJid: parsed.groupJid } // groupJid as query param
            });
            return { content: [{ type: "text", text: `Participant update (${parsed.action}) executed for group ${parsed.groupJid}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling update_participant:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error updating participants: ${errorText}` }] };
        }
   },

    update_group_subject: async (args) => {
        const parsed = schemas.toolInputs.update_group_subject.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/group/updateGroupSubject/${instanceName}`;
        console.log(`Calling ${url} with query and body:`, parsed);

        try {
            const response = await axios.post(url, { subject: parsed.subject }, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                params: { groupJid: parsed.groupJid }
            });
            return { content: [{ type: "text", text: `Group subject updated for ${parsed.groupJid}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling update_group_subject:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error updating group subject: ${errorText}` }] };
        }
    },

    update_group_description: async (args) => {
        const parsed = schemas.toolInputs.update_group_description.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/group/updateGroupDescription/${instanceName}`;
         console.log(`Calling ${url} with query and body:`, parsed);

        try {
            const response = await axios.post(url, { description: parsed.description }, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                params: { groupJid: parsed.groupJid }
            });
            return { content: [{ type: "text", text: `Group description updated for ${parsed.groupJid}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling update_group_description:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error updating group description: ${errorText}` }] };
        }
    },

    update_group_picture: async (args) => {
        const parsed = schemas.toolInputs.update_group_picture.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/group/updateGroupPicture/${instanceName}`;
        console.log(`Calling ${url} with query and body:`, { groupJid: parsed.groupJid, image: 'URL/Base64 provided' });


        try {
            const response = await axios.post(url, { url: parsed.image }, { // Assuming API expects { url: ... }
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                params: { groupJid: parsed.groupJid }
            });
            return { content: [{ type: "text", text: `Group picture update requested for ${parsed.groupJid}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling update_group_picture:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error updating group picture: ${errorText}` }] };
        }
    },
     fetch_invite_code: async (args) => {
        const parsed = schemas.toolInputs.fetch_invite_code.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/group/inviteCode/${instanceName}`;
        console.log(`Calling ${url} with query:`, parsed);

        try {
            const response = await axios.get(url, {
                headers: { 'apikey': apiKey },
                params: { groupJid: parsed.groupJid }
            });
            return { content: [{ type: "text", text: `Invite code for ${parsed.groupJid}: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling fetch_invite_code:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error fetching invite code: ${errorText}` }] };
        }
     },
     revoke_invite_code: async (args) => {
        const parsed = schemas.toolInputs.revoke_invite_code.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/group/revokeInviteCode/${instanceName}`;
        console.log(`Calling ${url} with query:`, parsed);

        try {
            // Assuming POST based on Postman example
            const response = await axios.post(url, {}, {
                headers: { 'apikey': apiKey },
                params: { groupJid: parsed.groupJid }
            });
            return { content: [{ type: "text", text: `Invite code revoked for ${parsed.groupJid}. New code: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling revoke_invite_code:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error revoking invite code: ${errorText}` }] };
        }
     },
     send_invite: async (args) => {
        const parsed = schemas.toolInputs.send_invite.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/group/sendInvite/${instanceName}`;
        console.log(`Calling ${url} with args:`, parsed);

        try {
            const response = await axios.post(url, parsed, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey }
            });
            return { content: [{ type: "text", text: `Invites sent for group ${parsed.groupJid}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling send_invite:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error sending invites: ${errorText}` }] };
        }
     },
     find_group_by_invite_code: async (args) => {
        const parsed = schemas.toolInputs.find_group_by_invite_code.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/group/inviteInfo/${instanceName}`;
        console.log(`Calling ${url} with query:`, parsed);

        try {
            const response = await axios.get(url, {
                headers: { 'apikey': apiKey },
                params: { inviteCode: parsed.inviteCode }
            });
            return { content: [{ type: "text", text: `Group info for invite code ${parsed.inviteCode}: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling find_group_by_invite_code:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error finding group by invite code: ${errorText}` }] };
        }
     },
     find_group_by_jid: async (args) => {
        const parsed = schemas.toolInputs.find_group_by_jid.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/group/findGroupInfos/${instanceName}`; // Endpoint name adjusted based on Postman
        console.log(`Calling ${url} with query:`, parsed);

        try {
            const response = await axios.get(url, {
                headers: { 'apikey': apiKey },
                params: { groupJid: parsed.groupJid }
            });
            return { content: [{ type: "text", text: `Group info for ${parsed.groupJid}: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling find_group_by_jid:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error finding group by JID: ${errorText}` }] };
        }
     },
     update_group_setting: async (args) => {
        const parsed = schemas.toolInputs.update_group_setting.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/group/updateSetting/${instanceName}`;
        console.log(`Calling ${url} with query and body:`, parsed);

        try {
            const response = await axios.post(url, { action: parsed.action }, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                params: { groupJid: parsed.groupJid }
            });
            return { content: [{ type: "text", text: `Group setting '${parsed.action}' updated for ${parsed.groupJid}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling update_group_setting:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error updating group setting: ${errorText}` }] };
        }
     },
     toggle_ephemeral: async (args) => {
        const parsed = schemas.toolInputs.toggle_ephemeral.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/group/toggleEphemeral/${instanceName}`;
        console.log(`Calling ${url} with query and body:`, parsed);

        try {
            const response = await axios.post(url, { expiration: parsed.expiration }, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                params: { groupJid: parsed.groupJid }
            });
             const durationText = parsed.expiration === 0 ? 'Off' : `${parsed.expiration / 86400} days`;
            return { content: [{ type: "text", text: `Ephemeral messages set to ${durationText} for ${parsed.groupJid}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling toggle_ephemeral:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error toggling ephemeral messages: ${errorText}` }] };
        }
     },
     leave_group: async (args) => {
        const parsed = schemas.toolInputs.leave_group.parse(args);
        const instanceName = getEnv("EVOLUTION_INSTANCE");
        const apiKey = getEnv("EVOLUTION_APIKEY");
        const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
        const url = `https://${apiBase}/group/leaveGroup/${instanceName}`;
        console.log(`Calling ${url} with query:`, parsed);

        try {
            const response = await axios.delete(url, {
                headers: { 'apikey': apiKey },
                params: { groupJid: parsed.groupJid }
            });
            return { content: [{ type: "text", text: `Left group ${parsed.groupJid}. Response: ${JSON.stringify(response.data, null, 2)}` }] };
        } catch (error) {
           console.error("Error calling leave_group:", error.response?.data || error.message);
           const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
           return { content: [{ type: "text", text: `Error leaving group: ${errorText}` }] };
        }
     },
      // --- Webhook Handler (Example - Find only) ---
      find_webhook_settings: async (args) => {
         const instanceName = getEnv("EVOLUTION_INSTANCE");
         const apiKey = getEnv("EVOLUTION_APIKEY");
         const apiBase = getEnv("EVOLUTION_API_BASE", "localhost:8080");
         const url = `https://${apiBase}/webhook/find/${instanceName}`;
         console.log(`Calling ${url}`);

         try {
             const response = await axios.get(url, {
                 headers: { 'apikey': apiKey },
             });
             return { content: [{ type: "text", text: `Webhook settings: ${JSON.stringify(response.data, null, 2)}` }] };
         } catch (error) {
            console.error("Error calling find_webhook_settings:", error.response?.data || error.message);
            const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
            return { content: [{ type: "text", text: `Error finding webhook settings: ${errorText}` }] };
         }
      },
};

// --- MCP Server Setup ---
const server = new Server({
  name: "evolution-api-tools-server",
  version: "1.1.0", // Incremented version
}, {
  capabilities: {
    tools: {},
  },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("Tool list requested by client");
  return { tools: TOOL_DEFINITIONS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`Tool call request received for: ${name}`);
  try {
    const handler = toolHandlers[name];
    if (!handler) {
        console.error(`Unknown tool requested: ${name}`);
        throw new Error(`Unknown tool: ${name}`);
    }
    // Log environment variables being used for this specific call
    console.log("🔐 Environment variables for this call:");
    console.log("EVOLUTION_INSTANCE:", process.env.EVOLUTION_INSTANCE);
    // console.log("EVOLUTION_APIKEY:", process.env.EVOLUTION_APIKEY ? '******' : 'Not Set'); // Mask API key in logs
    console.log("EVOLUTION_API_BASE:", process.env.EVOLUTION_API_BASE);

    const result = await handler(args);
    console.error(`Tool ${name} executed successfully.`);
    return result;
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error);
    // Ensure error is propagated correctly for MCP client
    // Re-throw or create a specific error structure if needed
     if (error instanceof z.ZodError) {
        // Provide more specific validation error feedback
        const message = `Input validation failed for tool ${name}: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
         console.error(message);
        // Throwing the original ZodError might expose too much detail; craft a user-friendly message
         throw new Error(message);
     }
    throw error; // Propagate other errors
  }
});

// --- Main Function ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("✅ Evolution API MCP Server running on stdio");
  console.error(`Loaded ${TOOL_DEFINITIONS.length} tools.`);
}

// --- Command Line Execution (for testing individual tools) ---
const cmdArgs = process.argv.slice(2);
if (cmdArgs.length > 0) {
    console.log("🛠️ Executing tool directly via command line...");
    const toolName = cmdArgs[0];
    const inputArgs = cmdArgs[1] ? JSON.parse(cmdArgs[1]) : {};

    // Log environment variables being used
    console.log("🔐 Environment variables loaded:");
    console.log("EVOLUTION_INSTANCE:", process.env.EVOLUTION_INSTANCE);
    // console.log("EVOLUTION_APIKEY:", process.env.EVOLUTION_APIKEY ? '******' : 'Not Set'); // Mask API key
    console.log("EVOLUTION_API_BASE:", process.env.EVOLUTION_API_BASE);


    if (toolHandlers[toolName]) {
        console.log(`Executing tool: ${toolName} with input:`, inputArgs);
        toolHandlers[toolName](inputArgs)
          .then((res) => {
            console.log("✅ Tool Result:");
            console.log(JSON.stringify(res, null, 2));
            process.exit(0);
          })
          .catch((err) => {
            console.error(`❌ Error executing ${toolName}:`, err.message);
             if (err.response?.data) {
                 console.error("API Response Error:", JSON.stringify(err.response.data, null, 2));
             }
             if (err instanceof z.ZodError) {
                console.error("Validation Errors:", err.errors);
             }
            process.exit(1);
          });
    } else {
        console.error(`❌ Unknown tool function: ${toolName}`);
        console.error(`Available tools: ${Object.keys(toolHandlers).join(', ')}`);
        process.exit(1);
    }
} else {
    // Start the MCP server if no command line arguments are passed
    main().catch((error) => {
        console.error("❌ Fatal Error starting MCP server:", error);
        process.exit(1);
    });
}
