# 🧘 AntarJyoti - Feature Enhancements Roadmap & Progress Plan

This document tracks the planning, implementation, and current status of features for the AntarJyoti Spiritual Wisdom Assistant.

---

## 🛠️ Feature Phasing & Status

| Phase | Feature Description | Easy / Low-Hanging | Status | Notes |
| :--- | :--- | :---: | :---: | :--- |
| **Phase 1** | **Modern Chat UI & Layout**<br>- Centered ChatGPT-like conversation column.<br>- Gemini-style clean assistant answers (no bubble borders/backgrounds).<br>- Collapsible sidebar drawer for Library & Admin. | Yes | **Completed** | Sidebar collapsible on desktop; auto-collapses on resize. Backdrop overlay enabled for mobile. |
| **Phase 1** | **Mobile Responsiveness & Space Optimization**<br>- Drawer behaves as standard touch overlay menu.<br>- Shrunked mobile header height and hidden subtitle. | Yes | **Completed** | Full responsive grid and mobile spaces optimized to fit more chat content on small viewports. |
| **Phase 1** | **Smart-Scroll Lock**<br>- Prevents viewport scrolling down when user scrolls up to read. | Yes | **Completed** | Optimized to use instant scrolling (`auto`) during stream loads to prevent scroll battles, with a tighter 30px near-bottom threshold. |
| **Phase 1** | **Collapsible References**<br>- Hide citations under a toggle button by default. | Yes | **Completed** | Clickable "References used" section toggle added to assistant responses. |
| **Phase 2** | **SQLite-Backed User Feedback**<br>- Thumbs up/down buttons on assistant messages.<br>- Log values (question, response, citation, latency) to SQLite.<br>- Admin console log panel to view logs. | Yes | **Pending** | Backend schemas and endpoints are set up in the live Fly.io deployment. UI components need integration. |
| **Phase 3** | **Optional User Accounts & History**<br>- JWT registration/login (not mandatory for guests).<br>- Saving and restoring chat histories to SQLite. | Deferred | **Pending** | Deferred to phase 3 to minimize complexity during initial rollout. |
| **Phase 4** | **Daily Spiritual Email Dispatcher**<br>- Seeded database of Verses/Shlokas.<br>- Scheduled email notifications with state tracking. | Deferred | **Pending** | Deferred to phase 4. Will use Resend/SendGrid and simple cron/background workers. |

---

## 🚀 Branching & Deployment Strategy

*   **Development Branch**: `feature/enhancements` (Active)
*   **Backend Hosting**: Deployed to Fly.io (`https://antarjyoti-backend.fly.dev`)
*   **Frontend Hosting (Stable Branch URL)**: `https://frontend-git-feature-enhancements-rh-s-antarjyoti.vercel.app`

---

## 🧩 Active Component Walkthrough

### 1. Smart-Scroll Lock
*   **Behavior**: When a user clicks "Ask", the viewport smoothly scrolls to the bottom of the message container. During streaming, tokens are appended instantly. If the user scrolls up by even `>30px` to read the top of the message, auto-scrolling is suspended immediately.
*   **Implementation**: Done in `frontend/src/App.tsx` via `useEffect` hook monitoring `messages` and an on-scroll event listener.

### 2. Collapsible Drawer Panel
*   **Behavior**: Library books, dynamic setting selectors (Gemini vs. Ollama), and DB ingestion controls are housed in the sidebar. The toggle button `☰` in the header collapses/expands the sidebar with smooth CSS transitions. On mobile devices, a semi-transparent backdrop overlay covers the chat area, allowing the user to dismiss the drawer by tapping outside.

### 3. Gemini-style Chat & Expandable Citations
*   **Behavior**: User questions remain in high-contrast bubbles, while assistant answers flow directly on the clean dark page background (no bubble container). Citations/references are collapsed by default under a clean toggle trigger.

---

## 📊 Next Steps (Phase 2: Feedback Integration)

Upon confirmation of the Phase 1 UI updates, we will proceed with:
1.  Adding interactive thumbs-up/down button overlays to assistant chat responses.
2.  Wiring up click actions to dispatch telemetry calls to `POST https://antarjyoti-backend.fly.dev/api/feedback` (calculating request latencies dynamically).
3.  Adding a "Feedback Log" tab within the Admin Settings panel to view SQLite feedback logs.
