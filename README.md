# WABA Sandbox

Local WhatsApp Business (Cloud API) webhook sandbox. It exposes a webhook
endpoint compatible with Meta's format and lets you push simulated inbound
messages (text, media, interactive, template) and status updates to your own
application. A small web console lets you configure everything at runtime and
observe traffic in real time.

## Features

- Fixed port `3737` (`http://localhost:3737`).
- Runtime configuration only (no `.env`): target webhook URL, verify token, and
  auth/JWT settings.
- `GET /webhook` – verification endpoint using the configured verify token.
- `POST /webhook` – receives webhooks (for debugging what your app sends) and
  always logs them to the console and live event stream.
- Simulation endpoints that forward WhatsApp-style webhooks to your app,
  covering most Cloud API message categories:
  - Text
  - Audio
  - Document (PDF)
  - Image
  - Video
  - Contacts (with address)
  - Location
  - Sticker
  - Template
  - Reaction
  - Interactive Reply Buttons
  - Interactive List
  - Interactive Call-To-Action URL / product & media carousels (as interactive
    replies)
  - Typing indicators
  - Read receipts (via status `read`)
  - Contextual replies (messages with `context.message_id`)
- JWT-based simulation auth (optional):
  - Configure JWT issuer/audience/secret at runtime.
  - Generate demo tokens via `POST /api/auth/token`.
  - Protect simulation and config APIs with `Authorization: Bearer <jwt>`.
- Simple EULA / policy simulation:
  - Runtime registry of contact policies (`allowed` / `blocked` / `unknown`).
  - Every simulated outbound event is annotated with a policy evaluation so you
    can see whether sending to that contact would be compliant.
- Marketing Messages simulation:
  - Opt-in/opt-out registry for marketing sends.
  - Graph-style `/<API_VERSION>/<PHONE_ID>/marketing_messages` endpoint that
    enforces marketing opt-in, a frequency cap, and regular messaging limits.
  - Local API to manage marketing contacts, config, and conversion events.
- Static media served under `/media` for real downloads used in simulations:
  - `/media/sample-image.png`
  - `/media/sample-document.pdf`
  - `/media/sample-audio.ogg`
  - `/media/sample-video.mp4`
  - `/media/sample-sticker.webp`
- Basic Graph-style business profile API for a phone number:
  - `GET /vXX.X/<PHONE_ID>/whatsapp_business_profile`
  - `POST /vXX.X/<PHONE_ID>/whatsapp_business_profile`
- Web console at `/`:
  - Configure sandbox at runtime (webhook URL, verify token, auth/JWT).
  - Manage a client auth token used by the UI for all API calls.
  - Trigger simulations without `curl`.
  - Live event stream showing all inbound/outbound activity.

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the sandbox in dev mode:

   ```bash
   npm run dev
   ```

3. Open the UI:

   - Navigate to `http://localhost:3737/`.
   - In the "Runtime configuration" card, set:
     - Target webhook URL (your application endpoint).
     - Verify token (any string you want to use).
     - Auth mode:
       - `none` – no `Authorization` header required (default).
       - `jwt` – all `/simulate/*` and `/api/config` calls require
         `Authorization: Bearer <token>`.
     - Optional JWT issuer/audience/secret (used when `auth.mode = "jwt"`).

4. Point your app at the sandbox:

   - Webhook URL: `http://localhost:3737/webhook`
   - Verify token: the same value you configured in the UI.

## HTTP reference

- `GET /health`  
  Returns the current status and target webhook URL.

- `GET /webhook`  
  Supports standard verification parameters:
  `hub.mode`, `hub.verify_token`, `hub.challenge`.

- `POST /webhook`  
  Accepts arbitrary JSON payloads and responds with:
  `{ "status": "received" }`. All webhook payloads are printed to the server
  console and mirrored in the live events stream.

- `GET /api/config` / `PUT /api/config`  
  Read/update runtime configuration (verify token, target URL, auth/JWT
  settings).

- `GET /api/events` / `GET /api/events/stream`  
  JSON list of recent events and a Server-Sent Events stream used by the web
  console.

- `GET /api/marketing/contacts` / `PUT /api/marketing/contacts/:waId` /  
  `GET /api/marketing/eligibility/:waId` / `GET|PUT /api/marketing/config` /  
  `GET /api/marketing/sends` / `GET|POST /api/marketing/conversions`  
  Manage marketing opt-in status, view frequency cap settings, list marketing
  sends, and record conversion events. Useful when simulating WhatsApp
  Marketing Messages opt-in and measurement flows.

- `GET /api/policy/contacts` / `PUT /api/policy/contacts/:waId` /
  `GET /api/policy/evaluate/:waId`  
  Simple in-memory registry and evaluation for whether a given WhatsApp ID is
  allowed to receive messages from you (EULA / policy simulation).

- `POST /api/auth/token`  
  Generate a sandbox JWT for use in `Authorization: Bearer <token>` headers.
  Tokens are signed with the current JWT configuration (`iss`, `aud`, `secret`)
  and are meant purely for local testing.

  Example:

  ```bash
  curl -s -X POST http://localhost:3737/api/auth/token \
    -H "Content-Type: application/json" \
    -d '{"sub":"local-service","scope":["simulate","config"]}'
  ```

  Use the returned `token` value as:

  ```bash
  curl -s http://localhost:3737/api/config \
    -H "Authorization: Bearer <token>"
  ```

### Message simulation endpoints

For every endpoint below, if auth mode is set to `jwt` you must include
`Authorization: Bearer <token>` in your curl requests.

- `POST /simulate/message` – simulate an inbound text message:

  ```jsonc
  {
    "from": "5511999999999",
    "body": "Hello from sandbox",
    "waId": "5511999999999",      // optional, defaults to from
    "name": "Sandbox User"        // optional
  }
  ```

- `POST /simulate/image` – simulate an inbound image:

  ```jsonc
  {
    "from": "5511999999999",
    "caption": "Sample image from sandbox",
    "mediaUrl": "http://localhost:3737/media/sample-image.png"
  }
  ```

- `POST /simulate/document` – simulate an inbound document:

  ```jsonc
  {
    "from": "5511999999999",
    "filename": "sample-document.pdf",
    "caption": "Sample document from sandbox",
    "mediaUrl": "http://localhost:3737/media/sample-document.pdf"
  }
  ```

- `POST /simulate/audio` – simulate an inbound audio/voice message:

  ```jsonc
  {
    "from": "5511999999999",
    "mediaUrl": "http://localhost:3737/media/sample-audio.ogg",
    "voice": true
  }
  ```

- `POST /simulate/status` – simulate message status updates:

  ```jsonc
  {
    "messageId": "wamid.SANDBOX-...",
    "recipientId": "5511999999999",
    "status": "sent | delivered | read | failed"
  }
  ```

- `POST /simulate/video` – simulate an inbound video:

  ```jsonc
  {
    "from": "5511999999999",
    "caption": "Sample video from sandbox",
    "mediaUrl": "http://localhost:3737/media/sample-video.mp4"
  }
  ```

- `POST /simulate/contacts` – simulate inbound contacts (with address):

  ```jsonc
  {
    "from": "5511999999999",
    "formattedName": "Sandbox User",
    "firstName": "Sandbox",
    "lastName": "User",
    "phone": "5511999999999",
    "email": "sandbox@example.com",
    "street": "Sandbox Street 123",
    "city": "Sandbox City",
    "country": "BR"
  }
  ```

- `POST /simulate/location` – simulate inbound location:

  ```jsonc
  {
    "from": "5511999999999",
    "latitude": -23.55052,
    "longitude": -46.633308,
    "name": "Sandbox Location",
    "address": "Sandbox Street 123, Sandbox City"
  }
  ```

- `POST /simulate/sticker` – simulate inbound sticker:

  ```jsonc
  {
    "from": "5511999999999",
    "mediaUrl": "http://localhost:3737/media/sample-sticker.webp"
  }
  ```

- `POST /simulate/reaction` – simulate reaction to a previous message:

  ```jsonc
  {
    "from": "5511999999999",
    "messageId": "wamid.SANDBOX-TEXT-...",
    "emoji": "👍"
  }
  ```

- `POST /simulate/template` – simulate a template message delivered to you:

  ```jsonc
  {
    "from": "5511999999999",
    "templateName": "order_update",
    "languageCode": "en_US"
  }
  ```

- `POST /simulate/interactive/buttons` – simulate interactive reply buttons:

  ```jsonc
  {
    "from": "5511999999999",
    "buttonId": "btn_yes",
    "buttonTitle": "Yes"
  }
  ```

- `POST /simulate/interactive/list` – simulate interactive list reply:

  ```jsonc
  {
    "from": "5511999999999",
    "selectionId": "option_1",
    "selectionTitle": "First option",
    "selectionDescription": "Example list selection"
  }
  ```

- `POST /simulate/interactive/product-carousel` – simulate product list /
  product carousel selection:

  ```jsonc
  {
    "from": "5511999999999",
    "productIds": ["prod_1", "prod_2"]
  }
  ```

- `POST /simulate/interactive/media-carousel` – simulate media carousel:

  ```jsonc
  {
    "from": "5511999999999",
    "mediaIds": ["media_1", "media_2"]
  }
  ```

- `POST /simulate/context-reply` – simulate contextual reply (quote reply):

  ```jsonc
  {
    "from": "5511999999999",
    "body": "Replying to your previous message",
    "contextMessageId": "wamid.SANDBOX-TEXT-..."
  }
  ```

- `POST /simulate/typing` – simulate typing indicators via webhook status:

  ```jsonc
  {
    "from": "5511999999999",
    "recipientId": "5511999999999",
    "typing": "on" // or "off"
  }
  ```

All `/simulate/*` endpoints forward a WhatsApp-style webhook payload to the
currently configured target webhook URL using `application/json`. For each
simulation, the sandbox also records an event with a basic EULA/policy
evaluation attached as metadata so you can see at a glance whether the message
targets a contact that is flagged as allowed or blocked.
