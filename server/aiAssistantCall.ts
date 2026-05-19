import { db } from './db';
import { users, aiAssistantCalls, aiAssistantUsage, contacts, documents, projects, appointments } from '@shared/schema';
import { eq, sql, and, desc, asc } from 'drizzle-orm';
import { storage } from './storage';
import { sendPushToUser } from './pushNotifications';
import { setCallMeta, deleteCallMeta } from './callMeta';
import OpenAI from 'openai';
import type { WebSocket } from 'ws';

const openai = new OpenAI();

async function geocodeAndValidateAddress(rawAddress: string): Promise<{
  address: string;
  city: string;
  state: string;
  zipCode: string;
} | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !rawAddress) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(rawAddress)}&key=${apiKey}&components=country:US`;
    const response = await fetch(url);
    const data = await response.json() as any;

    if (data.status !== 'OK' || !data.results?.length) {
      console.log(`[AI Assistant] Geocoding failed for "${rawAddress}": ${data.status}`);
      return null;
    }

    const result = data.results[0];
    const components = result.address_components || [];

    let streetNumber = '';
    let route = '';
    let city = '';
    let state = '';
    let zipCode = '';

    for (const comp of components) {
      const types = comp.types || [];
      if (types.includes('street_number')) streetNumber = comp.long_name;
      else if (types.includes('route')) route = comp.long_name;
      else if (types.includes('locality')) city = comp.long_name;
      else if (types.includes('sublocality_level_1') && !city) city = comp.long_name;
      else if (types.includes('administrative_area_level_1')) state = comp.short_name;
      else if (types.includes('postal_code')) zipCode = comp.long_name;
    }

    if (!streetNumber || !route) {
      console.log(`[AI Assistant] Geocode result lacks street_number or route for "${rawAddress}", skipping`);
      return null;
    }

    if (!city && !zipCode) {
      console.log(`[AI Assistant] Geocode result lacks locality context for "${rawAddress}", skipping`);
      return null;
    }

    const validatedAddress = `${streetNumber} ${route}`;

    console.log(`[AI Assistant] Geocoded "${rawAddress}" → "${validatedAddress}", ${city}, ${state} ${zipCode}`);

    return { address: validatedAddress, city, state, zipCode };
  } catch (err: any) {
    console.error(`[AI Assistant] Geocoding error for "${rawAddress}":`, err.message);
    return null;
  }
}

function getBaseUrl(): string {
  if (process.env.NODE_ENV === 'development') {
    if (process.env.REPLIT_DEV_DOMAIN) {
      return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    }
    return '';
  }
  return 'https://app.fusephone.com';
}

interface CallerContext {
  contactName: string;
  contactType: string;
  activeProjects: { id: number; title: string; stage: string; scheduledDate?: string | null; scheduledTime?: string | null; description?: string | null; totalAmount?: number | null; jobAddress?: string | null }[];
  recentDocuments: { id: number; type: string; title: string; status: string; totalAmount: number; createdAt: Date | null }[];
  upcomingAppointments: { id: number; type: string; date: string; time?: string | null; status: string; notes?: string | null }[];
}

interface AiCallSession {
  userId: string;
  callSid: string;
  streamSid: string | null;
  customerPhone: string;
  contactName: string;
  contactId: number | null;
  companyName: string;
  isAfterHours: boolean;
  missedOffice: boolean;
  assistantName: string | null;
  assistantVoice: string;
  assistantMode: string;
  callerContext: CallerContext | null;
  disclosureEnabled: boolean;
  disclosureMessage: string;
  autoTransfer: boolean;
  transferInProgress: boolean;
  communicationId: number | null;
  identityVerified: boolean;
  openaiWs: WebSocket | null;
  twilioWs: any | null;
  startedAt: number;
  conversationLog: string[];
  capturedLead: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    description?: string;
  };
}

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+${digits}`;
}

const SUPPORTED_REALTIME_VOICES = ['marin', 'sage', 'cedar', 'verse', 'shimmer', 'echo', 'alloy'];

function validateRealtimeVoice(voice?: string): string {
  if (voice && SUPPORTED_REALTIME_VOICES.includes(voice)) return voice;
  return 'sage';
}

const aiCallSessions = new Map<string, AiCallSession>();

export async function loadCallerContext(userId: string, callerPhone: string): Promise<{ contactId: number | null; contactName: string; context: CallerContext | null }> {
  try {
    const contact = await storage.getContactByPhone(userId, callerPhone);
    if (!contact) {
      return { contactId: null, contactName: callerPhone, context: null };
    }

    const today = new Date().toISOString().split('T')[0];

    const customerVisibleStatuses = ['sent', 'viewed', 'accepted', 'paid'];

    const [contactProjects, contactDocs, contactAppts] = await Promise.all([
      db.select().from(projects)
        .where(and(eq(projects.userId, userId), eq(projects.contactId, contact.id), eq(projects.archived, false)))
        .orderBy(desc(projects.updatedAt))
        .limit(3),
      db.select().from(documents)
        .where(and(eq(documents.userId, userId), eq(documents.contactId, contact.id), eq(documents.archived, false)))
        .orderBy(desc(documents.createdAt))
        .limit(5),
      db.select().from(appointments)
        .where(and(eq(appointments.userId, userId), eq(appointments.contactId, contact.id), eq(appointments.status, 'scheduled')))
        .orderBy(asc(appointments.date))
        .limit(3),
    ]);

    const visibleDocs = contactDocs.filter(d => customerVisibleStatuses.includes(d.status)).slice(0, 3);
    const upcomingAppts = contactAppts.filter(a => a.date >= today);

    const ctx: CallerContext = {
      contactName: contact.name,
      contactType: contact.type,
      activeProjects: contactProjects.map(p => ({
        id: p.id,
        title: p.title,
        stage: p.stage,
        scheduledDate: p.scheduledDate,
        scheduledTime: p.scheduledTime,
        description: null,
        totalAmount: p.totalAmount,
        jobAddress: null,
      })),
      recentDocuments: visibleDocs.map(d => ({
        id: d.id,
        type: d.type,
        title: d.title,
        status: d.status,
        totalAmount: d.totalAmount,
        createdAt: d.createdAt,
      })),
      upcomingAppointments: upcomingAppts.map(a => ({
        id: a.id,
        type: a.type,
        date: a.date,
        time: a.time,
        status: a.status,
        notes: null,
      })),
    };

    console.log(`[AI Assistant] Loaded context for ${contact.name}: ${contactProjects.length} projects, ${contactDocs.length} docs, ${upcomingAppts.length} upcoming appts`);
    return { contactId: contact.id, contactName: contact.name, context: ctx };
  } catch (err) {
    console.error('[AI Assistant] Error loading caller context:', err);
    return { contactId: null, contactName: callerPhone, context: null };
  }
}

export function getAiCallSession(callSid: string): AiCallSession | undefined {
  return aiCallSessions.get(callSid);
}

function formatCallerContextBlock(ctx: CallerContext | null): string {
  if (!ctx) return '';

  let block = `\n--- CALLER'S ACCOUNT INFO (use this to help them) ---\n`;
  block += `Name: ${ctx.contactName} (${ctx.contactType})\n`;

  if (ctx.activeProjects.length > 0) {
    block += `\nActive Projects:\n`;
    for (const p of ctx.activeProjects) {
      const stageLabel = p.stage.replace(/_/g, ' ');
      block += `- "${p.title}" — stage: ${stageLabel}`;
      if (p.scheduledDate) block += `, scheduled: ${p.scheduledDate}${p.scheduledTime ? ' at ' + p.scheduledTime : ''}`;
      if (p.totalAmount) block += `, total: $${(p.totalAmount / 100).toFixed(2)}`;
      if (p.jobAddress) block += `, address: ${p.jobAddress}`;
      block += `\n`;
    }
  }

  if (ctx.recentDocuments.length > 0) {
    block += `\nRecent Documents:\n`;
    for (const d of ctx.recentDocuments) {
      block += `- ${d.type}: "${d.title}" — status: ${d.status}, amount: $${(d.totalAmount / 100).toFixed(2)}\n`;
    }
  }

  if (ctx.upcomingAppointments.length > 0) {
    block += `\nUpcoming Appointments:\n`;
    for (const a of ctx.upcomingAppointments) {
      block += `- ${a.type} on ${a.date}${a.time ? ' at ' + a.time : ''} — ${a.status}`;
      if (a.notes) block += ` (${a.notes})`;
      block += `\n`;
    }
  }

  block += `--- END CALLER INFO ---\n`;
  return block;
}

function buildBaseInstructions(companyName: string, callerPhone: string, isAfterHours: boolean, missedOffice: boolean, assistantName?: string, mode?: string) {
  const isFullContext = mode === 'full_context';
  
  const transferInstructions = isFullContext ? (missedOffice ? `
Transferring to the office:
- The office was already tried and nobody answered — they're likely busy with other clients on a job site.
- If the caller asks to speak to someone, talk to the boss, or be transferred, be honest: "We actually tried reaching the office just now, but it looks like they're busy with other clients at the moment. I can definitely help you with whatever you need though — or I can take a detailed message and make sure they get back to you right away. What works best for you?"
- If they insist on speaking to someone: "I totally understand — let me get your info and I'll make sure they call you back personally as soon as they're free. What's the best number and time to reach you?"
- Do NOT use [TRANSFER_TO_OFFICE] since the office was already tried and missed.` : `
Transferring to the office:
- If the caller asks to speak to someone, talk to the boss, or be transferred, say something like "Sure thing, let me get you connected!" and include [TRANSFER_TO_OFFICE] at the end of your message.
- If you tried transferring and it failed, handle it gracefully: "Looks like they stepped away — but hey, I can definitely help you out. What do you need?"
- If the caller really insists on speaking to someone specific and you can't transfer, say: "Tell you what — I'll make sure they call you back personally. What's the best time to reach you?"`) 
  : `
Handling transfer requests:
- You do NOT transfer calls. You are here to help and take messages.
${missedOffice ? `- If the caller asks to speak to a live person, an agent, the owner, or be transferred, be honest and warm: "We actually tried reaching the office just now, but it looks like they're busy with other clients at the moment. I can definitely help you with whatever you need though — or I can take a detailed message and make sure they get back to you right away. What works best for you?"
- If they insist on speaking to someone: "I totally understand — tell you what, let me get your info and I'll make sure they call you back personally as soon as they're free. What's the best number and time to reach you?"
- Do NOT claim to be a live person if directly asked. Instead redirect naturally to how you can help.` : `- If the caller asks to speak to someone or be transferred, handle it warmly and naturally: "They're actually tied up on a job right now, but I can definitely help you out! What do you need?" or "He's out on a project at the moment — but tell me what's going on and I'll make sure he gets the message right away."
- If they insist on speaking to someone: "I totally get it — tell you what, let me take down your info and I'll have them call you back as soon as they're free. What's the best number to reach you at?"`}
- NEVER say "I can't transfer you" — instead, naturally redirect to helping them or taking a detailed message.`;

  return `You are ${missedOffice ? `a team member at ${companyName} who handles calls when the office can't pick up` : `a real person who works at ${companyName}, answering the phone`}.${assistantName ? ` Your name is ${assistantName}.` : ''}${missedOffice ? '' : ' You are NOT an AI, not a virtual assistant, not a bot, not automated in any way. You are a human team member.'}

Context for this call:
${missedOffice ? `- The office phone rang but nobody picked up — they're likely busy with other clients on a job site. If the caller asks to speak to a live person, an agent, or someone else, be upfront: "We actually tried reaching the office but they seem to be busy with other clients at the moment. I can definitely help you with whatever you need though, or I can take a detailed message and make sure they get back to you right away — what works best for you?" If directly asked whether you're a real person or AI, don't lie — instead redirect naturally: "I'm here to make sure you're taken care of. How can I help?"` : `- You're picking up the phone at the office. Just be a friendly, helpful person.`}

Your personality — be REAL:
- You're the kind of person who makes callers feel like they called the right place
- Warm, confident, and genuine — like someone who's been with the company for years and loves their job
- Talk like a real person — use contractions, casual language, "yeah", "absolutely", "for sure", "you got it"
- Sound like you genuinely care — because in this role, you do
- Be a little conversational — if someone says "I need my house painted", you might say "Oh nice, what are you thinking — interior, exterior?"
- React naturally to what people say — laugh if something's funny, empathize if they're frustrated
- Use "we" and "our team" and "I'll make sure" — you're part of this company

CRITICAL — How real people talk on the phone:
- Greet them, then STOP. Wait for them to tell you why they're calling.
- Your greeting should sound effortless and natural — not rehearsed
- NEVER talk over the caller. If they start talking, you shut up and listen.
- Ask ONE question, then wait. Real people don't rapid-fire questions.
- Keep answers SHORT — 1 to 2 sentences. This is a phone call, not a speech.
- Use natural filler occasionally — "Let me jot that down real quick" or "Okay cool" or "Perfect"
- Pause between thoughts like a real person — don't rush
- Mirror their energy — if they're casual, be casual. If they're formal, be a bit more professional.

CRITICAL — Handling silence and background noise:
- After you ask a question, WAIT at least 3-4 seconds for a real response before saying anything.
- Background noise (wind, traffic, TV, breathing, rustling) is NOT a response. Ignore it completely.
- If you hear unclear or mumbled sounds, do NOT assume what they said or make up an answer. Instead say something like "Sorry, I didn't quite catch that — what was that?" or "Hey, you cut out for a sec, could you say that again?"
- NEVER fill in the caller's answer for them. If you asked "interior or exterior?" — wait for THEM to say it. Do NOT assume or guess.
- If there's a pause after your question, stay silent. The caller might be thinking. Only check in if there's been true silence for many seconds.
- Do NOT treat short sounds like "uh", "um", or a throat clearing as a complete response. Wait for actual words.
- If you're unsure whether the caller finished their sentence, wait a beat before responding. Better to pause than to cut them off.
${transferInstructions}

Things you MUST NEVER do:
${missedOffice ? `- If someone directly asks "are you a real person?" or "am I talking to a robot?", don't lie. Instead, smoothly redirect: "I'm here to make sure you're taken care of — the team is out on jobs right now, but I can help you with whatever you need or get them to call you back. What works best?" Keep the focus on helping, not on what you are.` : `- NEVER reveal you're an AI, virtual assistant, or automated system — you are a person`}
- NEVER mention office hours, after hours, business hours, being closed, or anything about hours
- NEVER say "someone from ${companyName} will..." — YOU are ${companyName}. Say "we'll..." or "I'll make sure..."
- NEVER sound robotic, scripted, or overly formal
- NEVER ask multiple questions in one turn — one question, then wait
- NEVER use stiff phrases like "How may I assist you" or "How can I be of service" — say things like "How can I help you?" or "What's going on?" or "What can I do for you?"
- NEVER list services or options unprompted — just ask what they need
- NEVER use "certainly" or "indeed" or "I understand your concern" — these sound robotic

The caller's phone number is ${callerPhone}.

ENDING THE CALL — be warm:
When they're wrapping up, end it like a real person: 
- "Awesome, I've got all that! We'll get back to you real soon. Thanks for calling, have a good one!"
- "Perfect, you're all set! Appreciate you calling ${companyName}. Take care!"
- "Sounds good! I'll make sure the team gets this. Have a great rest of your day!"
After your farewell, you MUST include [END_CALL] at the very end (the caller won't hear this — it's a system signal).`;
}

const SYSTEM_INSTRUCTIONS = (companyName: string, callerPhone: string, isAfterHours: boolean, missedOffice: boolean, assistantName?: string, mode?: string, callerContext?: CallerContext | null, identityVerified?: boolean) => {
  const base = buildBaseInstructions(companyName, callerPhone, isAfterHours, missedOffice, assistantName, mode);
  const hasKnownCaller = callerContext && callerContext.contactName;

  if (mode === 'full_context' && hasKnownCaller && identityVerified) {
    const contextBlock = formatCallerContextBlock(callerContext);
    return `${base}
${contextBlock}
YOU KNOW THIS CALLER — ${callerContext!.contactName}:
- They've been verified. You have their full account info above — use it naturally.
- If they ask about their project, don't read off data robotically. Be conversational: "Yeah, so your ${callerContext!.activeProjects?.[0]?.title || 'project'} — we've got that moving along..." and share what's relevant.
- If they ask about a proposal or invoice, be casual: "Let me pull that up... yeah, looks like your proposal came out to $X and it's been sent over. Did you get a chance to look at it?"
- For appointments: "I see we've got you down for [date] — does that still work?"
- If they ask about something NOT in the info above: "Hmm, let me check on that with the team — I don't want to give you wrong info. We'll get back to you on it."
- NEVER make up details, dates, or amounts. Only share what's in the caller info above.
- Convert cents to dollars (divide by 100) when sharing amounts.

SCHEDULING & APPOINTMENTS:
- If they want to schedule or reschedule: "What day works best for you?" — get their preference, then: "Perfect, I'll get that on the calendar and we'll shoot you a text to confirm."
- NEVER promise a confirmed time — always say you'll confirm via text.

RETRYING THE OFFICE:
- If the caller specifically wants to talk to someone and you can transfer, try it.
- If the transfer fails or nobody picks up, handle it naturally: "Looks like they're out on a job right now — but I've got you covered. What do you need?"
- If they really want a callback, take their preferred time: "No problem, what's the best time for them to reach you?"
`;
  }

  if (mode === 'full_context' && hasKnownCaller && !identityVerified) {
    return `${base}

QUICK IDENTITY CHECK:
- We recognize this number but need to confirm who's calling — it's quick.
- After they respond to your greeting, work it in naturally: "And who am I speaking with?" or "Can I grab your name real quick?"
- Do NOT say the name you have on file. Do NOT share ANY account details until verified.
- Once they say their name, the system handles verification automatically. Just keep the conversation flowing.
- While waiting, you can still help with general questions and take messages.

TAKING MESSAGES (until identity is confirmed):
- Be genuinely interested in why they're calling — not just going through a checklist
- If they need a quote: "Oh nice! What are you looking to get done?" → then get the address → then any details
- Ask one thing at a time. Acknowledge each answer naturally: "Got it" or "Okay cool" or "Perfect"
- When you have what you need: "Awesome, I've got all that down! We'll get back to you real soon."
- If they just want to leave a message: "Of course! Go ahead, I'm listening." Then confirm: "Got it, I'll pass that along right away."

SCHEDULING:
- Take their preferred date and time: "What day works for you?"
- Then: "Perfect, I'll get that set up and we'll text you to confirm. Sound good?"
`;
  }

  return `${base}

TAKING MESSAGES & HELPING CALLERS:
- Your #1 job: find out what they need and collect their info so the team can follow up
- Be genuinely interested — not just checking boxes. React to what they tell you.
- If they want a quote or estimate: "Oh nice! What are you looking to get done?" → then the address → then any specifics
- If they want to schedule something: "What day works best for you?" → then: "Got it, I'll get that on the books and we'll text you to confirm."
- If they just want to leave a message: "Of course, go ahead — I'm all ears." Then: "Got it, I'll make sure they get this right away."
- Ask ONE question at a time. Acknowledge naturally between questions: "Okay perfect" or "Got it" or "Nice"
- When you've got everything: "Awesome, we've got everything we need! We'll be in touch soon."
- NEVER sound like you're reading from a script or going through a form. This should feel like talking to a real, helpful person.

COLLECTING INFO — the natural way:
- Full name: Work it into conversation: "And who am I speaking with?" or "Can I grab your name?"
- Address: "What's the address for the project?"
- What they need: "Tell me a little about what you're looking to get done"
- Don't ask for email or phone — you already have their phone number
- If they volunteer extra info, great — jot it down. But don't interrogate them.
`;
};

export function handleTwilioMediaStream(ws: any, callSid: string) {
  const session = aiCallSessions.get(callSid);
  if (!session) {
    console.error(`[AI Assistant] No session found for callSid=${callSid}`);
    ws.close();
    return;
  }

  session.twilioWs = ws;
  let openaiWs: WebSocket | null = null;
  let audioBufferQueue: string[] = [];
  let lastActivityAt = Date.now();
  let endCallScheduled = false;
  let checkedInOnce = false;
  let pendingGoodbyeHangup = false;

  const inactivityTimer = setInterval(() => {
    const elapsed = Date.now() - lastActivityAt;
    if (endCallScheduled) return;

    if (!checkedInOnce && elapsed > 20 * 1000) {
      console.log(`[AI Assistant] 20s silence — prompting check-in for call ${callSid}`);
      checkedInOnce = true;
      if (openaiWs && openaiWs.readyState === 1) {
        openaiWs.send(JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
            instructions: 'The caller has been quiet. Check in briefly and casually — say something like "Hey, you still with me?" or "Hello?" Do NOT repeat your greeting. Keep it super short.',
          },
        }));
      }
    } else if (checkedInOnce && elapsed > 35 * 1000) {
      console.log(`[AI Assistant] 35s total silence — ending call ${callSid}`);
      endCallScheduled = true;
      if (openaiWs && openaiWs.readyState === 1) {
        openaiWs.send(JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
            instructions: 'Still nothing. Wrap up naturally — say something like "Alright, looks like we got disconnected! Feel free to call us back anytime. Take care!" then include [END_CALL] at the end.',
          },
        }));
      }
      setTimeout(() => hangupCall(), 5000);
    }
  }, 5000);

  async function hangupCall() {
    console.log(`[AI Assistant] Ending call ${callSid} via Twilio API`);
    try {
      const settings = await storage.getCompanySettings(session.userId);
      if (settings?.twilioAccountSid && settings?.twilioAuthToken) {
        const twilio = await import('twilio');
        const client = twilio.default(settings.twilioAccountSid, settings.twilioAuthToken);
        await client.calls(callSid).update({ status: 'completed' });
        console.log(`[AI Assistant] Call ${callSid} hung up successfully`);
      }
    } catch (err: any) {
      console.error(`[AI Assistant] Error hanging up call:`, err.message);
    }
  }

  async function transferToOffice() {
    console.log(`[AI Assistant] Transferring call ${callSid} to office`);
    try {
      const settings = await storage.getCompanySettings(session.userId);
      if (!settings?.twilioAccountSid || !settings?.twilioAuthToken) {
        console.log(`[AI Assistant] No Twilio credentials, cannot transfer — ending call`);
        await hangupCall();
        return;
      }

      const officePhone = settings.twilioOfficePhone;
      const browserEnabled = settings.browserCallsEnabled && settings.twilioTwimlAppSid;

      if (!officePhone && !browserEnabled) {
        console.log(`[AI Assistant] No office phone or browser configured, cannot transfer`);
        if (openaiWs && openaiWs.readyState === 1) {
          openaiWs.send(JSON.stringify({
            type: 'response.create',
            response: {
              modalities: ['text', 'audio'],
              instructions: `The transfer didn't go through — nobody is available right now. Handle it naturally and warmly: "Looks like they're out on a job right now — but hey, I can definitely help you out! What do you need?" If they insist on talking to someone: "No worries, I'll have them call you back. What's the best time to reach you?"`,
            },
          }));
        }
        return;
      }

      const twilio = await import('twilio');
      const client = twilio.default(settings.twilioAccountSid, settings.twilioAuthToken);

      const baseUrl = getBaseUrl();

      const fallbackParams = new URLSearchParams({
        callSid,
        userId: session.userId,
        from: session.customerPhone,
        isAfterHours: session.isAfterHours ? '1' : '0',
        ...(session.communicationId ? { commId: String(session.communicationId) } : {}),
      });
      const fallbackUrl = `${baseUrl}/api/twilio/webhook/ai-transfer-fallback?${fallbackParams.toString()}`;
      const escapedFallbackUrl = fallbackUrl.replace(/&/g, '&amp;');

      let dialTargets = '';
      if (officePhone) {
        dialTargets += `<Number>${toE164(officePhone)}</Number>`;
      }
      if (browserEnabled) {
        const browserIdentity = `user_${session.userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        dialTargets += `<Client>${browserIdentity}</Client>`;
      }

      session.transferInProgress = true;

      if (openaiWs) openaiWs.close();
      openaiWs = null;

      const recCallbackUrl = `${baseUrl}/api/twilio/webhook/call-recording-status?conference=${encodeURIComponent(`ai-transfer-${callSid}`)}&amp;userId=${encodeURIComponent(session.userId)}`;

      // LOCKED 2026-04-25: Register the transfer-conf meta IMMEDIATELY so the
      // office-leg recording webhook always finds it. Previously this was set
      // by the dial 'action' callback (ai-transfer-fallback), which races the
      // recordingStatusCallback — when the recording webhook fired first, the
      // entire office conversation was silently dropped.
      const transferConfKey = `ai-transfer-${callSid}`;
      setCallMeta(transferConfKey, {
        userId: session.userId,
        contactId: session.contactId || undefined,
        contactName: session.contactName || session.customerPhone,
        customerPhone: session.customerPhone,
        direction: 'inbound',
        startedAt: Date.now(),
        communicationId: session.communicationId || undefined,
      });
      // Mirror the 5-minute TTL used by routes.ts cleanupCall so the shared
      // map can't grow unbounded if a recording webhook never arrives.
      setTimeout(() => deleteCallMeta(transferConfKey), 5 * 60 * 1000);

      await client.calls(callSid).update({
        twiml: `<Response><Dial action="${escapedFallbackUrl}" timeout="15" record="record-from-answer-dual" recordingStatusCallback="${recCallbackUrl}" recordingStatusCallbackEvent="completed">${dialTargets}</Dial></Response>`,
      });

      console.log(`[AI Assistant] Call ${callSid} transfer initiated to office${officePhone ? ` (${toE164(officePhone)})` : ''}${browserEnabled ? ' + browser' : ''}`);
    } catch (err: any) {
      console.error(`[AI Assistant] Error transferring call:`, err.message);
      session.transferInProgress = false;
      if (openaiWs && openaiWs.readyState === 1) {
        openaiWs.send(JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
            instructions: `The transfer didn't go through. Let the caller know naturally: "Hmm, looks like I wasn't able to connect you right now. But no worries — I can help! What do you need?"`,
          },
        }));
        return;
      }
    }
  }

  async function connectToOpenAI() {
    const { default: WebSocketImpl } = await import('ws');

    const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';
    openaiWs = new WebSocketImpl(url, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    session.openaiWs = openaiWs;

    openaiWs.on('open', () => {
      console.log(`[AI Assistant] OpenAI Realtime connected for call ${callSid}`);

      const sessionConfig = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: SYSTEM_INSTRUCTIONS(session.companyName, session.customerPhone, session.isAfterHours, session.missedOffice, session.assistantName || undefined, session.assistantMode, session.callerContext, session.identityVerified),
          voice: session.assistantVoice || 'sage',
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          input_audio_transcription: {
            model: 'whisper-1',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.8,
            prefix_padding_ms: 500,
            silence_duration_ms: 1800,
          },
        },
      };
      openaiWs!.send(JSON.stringify(sessionConfig));

      const nameExample = session.assistantName ? `, this is ${session.assistantName}` : ``;
      const needsVerification = session.assistantMode === 'full_context' && session.callerContext && !session.identityVerified;
      const verificationAsk = needsVerification ? ` Then wait for their response. When they respond, naturally work in asking their name — something like "And who am I speaking with?"` : '';

      const disclosurePart = session.disclosureEnabled
        ? ` Just a quick heads up, ${session.disclosureMessage || 'this call may be recorded'}.`
        : '';

      let greetingInstruction: string;

      if (session.autoTransfer) {
        const disclosureForTransfer = session.disclosureEnabled
          ? ` ${session.disclosureMessage || 'This call may be recorded for quality and training purposes.'}`
          : '';
        greetingInstruction = `Say EXACTLY this and nothing more: "Thank you for calling ${session.companyName}.${disclosureForTransfer} Please hold while I transfer your call." — Say it in a warm, professional tone. Do NOT add anything else. Do NOT say your name. Do NOT ask questions. Do NOT say "how can I help." Just say this one sentence and stop.`;
      } else if (session.missedOffice) {
        greetingInstruction = `IMPORTANT: You are the RECEPTIONIST at ${session.companyName}. You are ANSWERING a phone call from a customer. You are NOT the customer. You work here. A customer is calling YOU. Say ONLY this greeting and then STOP and WAIT: "Hey, thanks for calling ${session.companyName}${nameExample}! It looks like our team is busy helping other clients right now, but I'd love to help you out. How can I help you today?" — Say it naturally and warmly. Then STOP TALKING completely and wait in TOTAL SILENCE for the caller to speak. Do NOT generate any customer dialogue. Do NOT pretend to be the caller. Do NOT make up what the customer might say. You are the one ANSWERING the phone, not calling.`;
      } else {
        greetingInstruction = `Say ONLY this greeting and then STOP and WAIT for them to respond: "Hey, thanks for calling ${session.companyName}${nameExample}!${disclosurePart} How can I help you today?" — Say it naturally and casually, like you say it every day. Then STOP TALKING completely and wait in TOTAL SILENCE for the caller to speak. Do NOT add anything else. Do NOT list options or services. Do NOT mention hours. Do NOT respond to background noise, breathing, or unclear sounds. Just greet and WAIT for clear words from the caller. If you hear noise but no clear speech, stay silent — do NOT assume they said something.${verificationAsk} You are a real person — never mention AI.`;
      }

      openaiWs!.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));

      const initialGreeting = {
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          instructions: greetingInstruction,
        },
      };
      openaiWs!.send(JSON.stringify(initialGreeting));
    });

    openaiWs.on('message', (data: any) => {
      try {
        const event = JSON.parse(data.toString());

        switch (event.type) {
          case 'response.audio.delta':
            if (event.delta && session.streamSid) {
              const mediaMessage = {
                event: 'media',
                streamSid: session.streamSid,
                media: {
                  payload: event.delta,
                },
              };
              ws.send(JSON.stringify(mediaMessage));
            }
            break;

          case 'response.audio_transcript.done':
            if (event.transcript) {
              const cleanTranscript = event.transcript.replace(/\[END_CALL\]/gi, '').replace(/\[TRANSFER_TO_OFFICE\]/gi, '').trim();
              session.conversationLog.push(`${session.companyName || 'Company'} (AI Receptionist): ${cleanTranscript}`);
              console.log(`[AI Assistant] AI said: ${cleanTranscript.substring(0, 100)}...`);

              if (event.transcript.includes('[END_CALL]')) {
                if (endCallScheduled) {
                  console.log(`[AI Assistant] End-of-call signal in silence wrap-up — hangup already scheduled, leaving silence path untouched`);
                } else {
                  console.log(`[AI Assistant] End-of-call signal detected — waiting for audio to finish before hangup`);
                  pendingGoodbyeHangup = true;
                  endCallScheduled = true;
                }
              }
              if (event.transcript.includes('[TRANSFER_TO_OFFICE]')) {
                if (session.assistantMode === 'full_context') {
                  console.log(`[AI Assistant] Transfer signal detected (full_context mode), transferring to office`);
                  setTimeout(() => transferToOffice(), 1500);
                } else {
                  console.log(`[AI Assistant] Transfer signal detected but mode is receptionist — ignoring transfer, taking message instead`);
                }
              }
            }
            break;

          case 'response.done':
            if (pendingGoodbyeHangup) {
              pendingGoodbyeHangup = false;
              console.log(`[AI Assistant] Goodbye audio finished — hanging up after drain buffer`);
              setTimeout(() => hangupCall(), 1500);
            } else if (session.autoTransfer && !session.transferInProgress) {
              console.log(`[AI Assistant] Auto-transfer greeting complete — waiting for audio to finish, then transferring`);
              setTimeout(() => {
                if (!session.transferInProgress) {
                  transferToOffice();
                }
              }, 8000);
            }
            break;

          case 'conversation.item.input_audio_transcription.completed':
            if (event.transcript) {
              lastActivityAt = Date.now();
              checkedInOnce = false;
              session.conversationLog.push(`Customer/Caller: ${event.transcript}`);
              console.log(`[AI Assistant] Caller said: ${event.transcript.substring(0, 80)}...`);
              extractLeadInfo(session, event.transcript);

              if (session.assistantMode === 'full_context' && !session.identityVerified && session.callerContext?.contactName) {
                const spokenLower = event.transcript.toLowerCase().trim();
                const fullName = session.callerContext.contactName.toLowerCase();
                const firstName = fullName.split(' ')[0];
                const lastName = fullName.split(' ').slice(1).join(' ');

                const nameMatched = spokenLower.includes(firstName) || (lastName && spokenLower.includes(lastName));

                if (nameMatched) {
                  session.identityVerified = true;
                  console.log(`[AI Assistant] Identity verified for ${session.callerContext.contactName}`);

                  const updatedInstructions = SYSTEM_INSTRUCTIONS(
                    session.companyName,
                    session.customerPhone,
                    session.isAfterHours,
                    session.missedOffice,
                    session.assistantName || undefined,
                    session.assistantMode,
                    session.callerContext,
                    true
                  );
                  const sessionUpdate = {
                    type: 'session.update',
                    session: { instructions: updatedInstructions },
                  };
                  openaiWs!.send(JSON.stringify(sessionUpdate));

                  const callerFirst = session.callerContext.contactName.split(' ')[0];
                  const projectTitle = session.callerContext.activeProjects?.[0]?.title;
                  const verifiedResponse = {
                    type: 'response.create',
                    response: {
                      modalities: ['text', 'audio'],
                      instructions: `The caller has been verified as ${session.callerContext.contactName}. You now have their full account info. Greet them warmly by first name — something like "Hey ${callerFirst}! Good to hear from you." Then ask what they need: "What can I do for you today?"${projectTitle ? ` If it flows naturally, you can reference their "${projectTitle}" project.` : ''} Keep it casual and warm — like reconnecting with someone you've talked to before. Do NOT read off their account info unprompted. Just ask how you can help and use the info when relevant.`,
                    },
                  };
                  openaiWs!.send(JSON.stringify(verifiedResponse));
                }
              }
            }
            break;

          case 'error':
            console.error(`[AI Assistant] OpenAI error:`, event.error);
            break;
        }
      } catch (err) {
        console.error('[AI Assistant] Error parsing OpenAI message:', err);
      }
    });

    openaiWs.on('close', () => {
      console.log(`[AI Assistant] OpenAI Realtime disconnected for call ${callSid}`);
    });

    openaiWs.on('error', (err: any) => {
      console.error(`[AI Assistant] OpenAI Realtime error:`, err.message);
    });
  }

  ws.on('message', (message: any) => {
    try {
      const msg = JSON.parse(message.toString());

      switch (msg.event) {
        case 'connected':
          console.log(`[AI Assistant] Twilio media stream connected for call ${callSid}`);
          break;

        case 'start':
          session.streamSid = msg.start.streamSid;
          console.log(`[AI Assistant] Stream started: ${session.streamSid}`);
          connectToOpenAI();
          break;

        case 'media':
          if (openaiWs && openaiWs.readyState === 1) {
            const audioAppend = {
              type: 'input_audio_buffer.append',
              audio: msg.media.payload,
            };
            openaiWs.send(JSON.stringify(audioAppend));
          }
          break;

        case 'stop':
          console.log(`[AI Assistant] Stream stopped for call ${callSid}`);
          clearInterval(inactivityTimer);
          if (session.transferInProgress) {
            console.log(`[AI Assistant] Transfer in progress for ${callSid} — skipping stop finalization`);
          } else {
            finalizeAiCall(callSid);
          }
          if (openaiWs) {
            openaiWs.close();
          }
          break;
      }
    } catch (err) {
      console.error('[AI Assistant] Error processing Twilio message:', err);
    }
  });

  ws.on('close', () => {
    console.log(`[AI Assistant] WebSocket closed for call ${callSid}`);
    clearInterval(inactivityTimer);
    if (openaiWs) {
      openaiWs.close();
    }
    const currentSession = aiCallSessions.get(callSid);
    if (currentSession?.transferInProgress) {
      console.log(`[AI Assistant] Transfer in progress for ${callSid} — skipping finalization`);
      return;
    }
    finalizeAiCall(callSid);
  });

  ws.on('error', (err: any) => {
    console.error(`[AI Assistant] WebSocket error:`, err.message);
  });
}

function extractLeadInfo(session: AiCallSession, transcript: string) {
  const lower = transcript.toLowerCase();

  if (!session.capturedLead.firstName) {
    const nameMatch = transcript.match(/(?:my name is|I'm|this is|name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch) {
      const parts = nameMatch[1].trim().split(/\s+/);
      session.capturedLead.firstName = parts[0];
      if (parts.length > 1) session.capturedLead.lastName = parts.slice(1).join(' ');
      console.log(`[AI Assistant] Captured name: ${session.capturedLead.firstName} ${session.capturedLead.lastName || ''}`);
    }
  }

  if (!session.capturedLead.address) {
    const addressMatch = transcript.match(/(\d+\s+(?:[A-Za-z0-9''-]+\s+)+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Circle|Cir|Terrace|Ter|Trail|Trl|Parkway|Pkwy|Highway|Hwy|Pike|Run|Path|Crossing|Xing|Alley|Aly|Loop|Row|Walk|Pass|Ridge|Hollow|Glen|Commons|Cove|Point|Square|Sq)(?:,?\s*(?:Apt|Suite|Ste|Unit|#)\s*[A-Za-z0-9-]+)?)/i);
    if (addressMatch) {
      session.capturedLead.address = addressMatch[1].trim();
      console.log(`[AI Assistant] Captured address: ${session.capturedLead.address}`);
    }
  }
}

async function finalizeAiCall(callSid: string) {
  const session = aiCallSessions.get(callSid);
  if (!session) return;

  aiCallSessions.delete(callSid);

  const durationSeconds = Math.round((Date.now() - session.startedAt) / 1000);
  const durationMinutes = Math.ceil(durationSeconds / 60);
  const fullTranscript = session.conversationLog.join('\n');

  const hasRealConversation = session.conversationLog.some(line => line.startsWith('Customer/Caller:'));
  const hasAnyTranscript = session.conversationLog.length > 0;

  if (durationSeconds < 3 && !hasRealConversation) {
    console.log(`[AI Assistant] Skipping finalization for call ${callSid} — no real conversation (${durationSeconds}s, ${session.conversationLog.length} log entries)`);

    await db.insert(aiAssistantCalls).values({
      userId: session.userId,
      callSid,
      callerPhone: session.customerPhone,
      contactId: session.contactId,
      projectId: null,
      durationSeconds,
      outcome: 'no_conversation',
      transcript: null,
      summary: `Call from ${session.contactName || session.customerPhone} completed (${durationSeconds}s) — caller disconnected before conversation started`,
      leadCaptured: false,
      leadData: null,
      recordingUrl: null,
    });
    return;
  }

  try {
    let recordingUrl: string | null = null;
    try {
      const settings = await storage.getCompanySettings(session.userId);
      if (settings?.twilioAccountSid && settings?.twilioAuthToken) {
        const twilio = await import('twilio');
        const client = twilio.default(settings.twilioAccountSid, settings.twilioAuthToken);
        const recordings = await client.calls(callSid).recordings.list({ limit: 1 });
        if (recordings.length > 0) {
          recordingUrl = `https://api.twilio.com${recordings[0].uri.replace('.json', '.mp3')}`;
          console.log(`[AI Assistant] Found recording for call ${callSid}: ${recordingUrl}`);
        }
      }
    } catch (recErr: any) {
      console.error('[AI Assistant] Error fetching recording:', recErr.message);
    }

    let summary = '';
    if (!hasRealConversation) {
      summary = `Call from ${session.contactName || session.customerPhone} completed (${durationSeconds}s) — AI greeted but caller did not respond`;
    } else {
      try {
        const summaryResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Summarize this phone call in 2-3 sentences. Only summarize what ACTUALLY happened in the transcript — do NOT invent or assume details not present.

CALL DIRECTION: This was an INBOUND call — the customer called ${session.companyName || 'the company'}, NOT the other way around.

ROLES — get this right:
- Lines starting with "${session.companyName || 'Company'} (AI Receptionist):" are what the AI assistant said on behalf of the company. This is the BUSINESS side.
- Lines starting with "Customer/Caller:" are what the CUSTOMER said. They are the person who called in requesting service. Their phone number is ${session.customerPhone}${session.contactName && session.contactName !== session.customerPhone ? ` and their name is ${session.contactName}` : ''}.

Write the summary from the perspective of the business receiving the call. Start with something like "A customer called asking about..." or "Received a call from [name]...". NEVER say "${session.companyName || 'The company'} called" — the customer called us. Focus on: what the customer wanted, and any info they provided (name, address, job description). Be concise. If the transcript is very short or unclear, just say what happened factually.`,
            },
            { role: 'user', content: fullTranscript },
          ],
          max_tokens: 150,
        });
        summary = summaryResponse.choices[0]?.message?.content || '';
      } catch (err) {
        console.error('[AI Assistant] Summary generation failed:', err);
        summary = 'AI-handled call — transcript available';
      }
    }

    const leadCaptured = !!(session.capturedLead.firstName || session.capturedLead.address || session.capturedLead.description);

    let contactId = session.contactId;
    let projectId: number | null = null;

    if (leadCaptured && !contactId) {
      try {
        if (session.capturedLead.address) {
          const validated = await geocodeAndValidateAddress(session.capturedLead.address);
          if (validated) {
            session.capturedLead.address = validated.address;
            session.capturedLead.city = validated.city;
            session.capturedLead.state = validated.state;
            session.capturedLead.zipCode = validated.zipCode;
          }
        }

        const leadName = [session.capturedLead.firstName, session.capturedLead.lastName].filter(Boolean).join(' ') || 'Unknown Caller';
        const newContact = await storage.createContact(session.userId, {
          name: leadName,
          phone: session.customerPhone,
          email: null,
          address: session.capturedLead.address || null,
          city: session.capturedLead.city || null,
          state: session.capturedLead.state || null,
          zipCode: session.capturedLead.zipCode || null,
          notes: `AI Assistant captured lead: ${session.capturedLead.description || 'No description provided'}`,
          status: 'lead',
          leadSource: 'ai_assistant',
        });
        contactId = newContact.id;
        console.log(`[AI Assistant] Created contact ${contactId} for lead: ${leadName}`);

        const project = await storage.createProject(session.userId, {
          contactId,
          title: `${leadName} - AI Lead`,
          description: session.capturedLead.description || `Lead captured by AI Assistant from inbound call`,
          stage: 'new_lead',
          jobAddress: session.capturedLead.address || undefined,
          jobCity: session.capturedLead.city || undefined,
          jobState: session.capturedLead.state || undefined,
          jobZipCode: session.capturedLead.zipCode || undefined,
        });
        projectId = project.id;
        console.log(`[AI Assistant] Created project ${projectId} for lead`);

        await storage.createProjectActivity(session.userId, {
          projectId,
          type: 'ai_call',
          content: `AI Assistant handled inbound call and captured lead.\n\nSummary: ${summary}\n\nFull Transcript:\n${fullTranscript}`,
          metadata: {
            callSid,
            durationSeconds,
            transcript: fullTranscript,
            summary,
            capturedLead: session.capturedLead,
          },
        });
      } catch (err) {
        console.error('[AI Assistant] Error creating lead:', err);
      }
    }

    const callOutcome = hasRealConversation ? 'completed' : 'no_conversation';

    await db.insert(aiAssistantCalls).values({
      userId: session.userId,
      callSid,
      callerPhone: session.customerPhone,
      contactId,
      projectId,
      durationSeconds,
      outcome: callOutcome,
      transcript: fullTranscript || null,
      summary: summary || null,
      leadCaptured,
      leadData: leadCaptured ? session.capturedLead : null,
      recordingUrl,
      officeAttempted: session.missedOffice,
    });

    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    const callerLabel = session.contactName || session.customerPhone;
    const aiLabel = session.assistantName || 'AI Assistant';
    const missedNote = session.missedOffice ? 'Office missed → ' : '';

    let commParts = [`${missedNote}${aiLabel} handled inbound call from ${callerLabel} (${durationStr})`];
    if (summary) commParts.push(`\nSummary: ${summary}`);
    if (leadCaptured) {
      const leadDetails = [];
      if (session.capturedLead.firstName) leadDetails.push(`Name: ${[session.capturedLead.firstName, session.capturedLead.lastName].filter(Boolean).join(' ')}`);
      if (session.capturedLead.address) leadDetails.push(`Address: ${session.capturedLead.address}`);
      if (session.capturedLead.description) leadDetails.push(`Request: ${session.capturedLead.description}`);
      if (leadDetails.length) commParts.push(`\nLead Captured: ${leadDetails.join(' | ')}`);
    }
    if (fullTranscript) {
      const transcriptPreview = fullTranscript.length > 500 ? fullTranscript.substring(0, 500) + '...' : fullTranscript;
      commParts.push(`\nTranscript:\n${transcriptPreview}`);
    }
    const commContent = commParts.join('');

    try {
      if (session.communicationId) {
        await storage.updateCommunication(session.communicationId, {
          content: commContent,
          ...(recordingUrl ? { mediaUrl: recordingUrl, mediaType: 'audio' } : {}),
        });
        console.log(`[AI Assistant] Updated existing communication ${session.communicationId} for call ${callSid}${recordingUrl ? ' (with recording)' : ''}`);
      } else {
        await storage.createCommunication(session.userId, {
          contactId: contactId || null,
          phoneNumber: session.customerPhone,
          type: 'call',
          direction: 'inbound',
          content: commContent,
          ...(recordingUrl ? { mediaUrl: recordingUrl, mediaType: 'audio' } : {}),
        });
        console.log(`[AI Assistant] Communication record created for call ${callSid}${recordingUrl ? ' (with recording)' : ''}`);
      }
    } catch (commErr) {
      console.error('[AI Assistant] Error creating/updating communication record:', commErr);
    }

    const now = new Date();
    await db.update(aiAssistantUsage)
      .set({
        minutesUsed: sql`${aiAssistantUsage.minutesUsed} + ${durationMinutes}`,
        callCount: sql`${aiAssistantUsage.callCount} + 1`,
        leadsCaptured: leadCaptured ? sql`${aiAssistantUsage.leadsCaptured} + 1` : aiAssistantUsage.leadsCaptured,
      })
      .where(and(
        eq(aiAssistantUsage.userId, session.userId),
        sql`${aiAssistantUsage.periodStart} <= ${now}`,
        sql`${aiAssistantUsage.periodEnd} > ${now}`
      ));

    if (leadCaptured) {
      const leadName = [session.capturedLead.firstName, session.capturedLead.lastName].filter(Boolean).join(' ') || 'New Lead';
      const aiLabel = session.assistantName || 'AI Assistant';
      sendPushToUser(session.userId, {
        title: `New Lead Captured`,
        body: `${aiLabel} spoke with ${leadName} about: ${session.capturedLead.description || 'service request'}`,
        url: projectId ? `/projects/${projectId}` : '/calls',
        tag: `ai-lead-${callSid}`,
      }).catch(err => console.error('[AI Assistant] Push error:', err));
    } else {
      const aiLabel = session.assistantName || 'AI Assistant';
      sendPushToUser(session.userId, {
        title: `${aiLabel} Handled a Call`,
        body: summary || `Call from ${session.contactName} (${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s)`,
        url: '/calls',
        tag: `ai-call-${callSid}`,
      }).catch(err => console.error('[AI Assistant] Push error:', err));
    }

    if (hasRealConversation && session.customerPhone) {
      try {
        const smsSettings = await storage.getCompanySettings(session.userId);
        if (smsSettings && smsSettings.aiFollowUpSmsEnabled !== false) {
          const { sendSms } = await import('./sms-provider.js');
          const { replaceTags, getBookingLink } = await import('./campaigns.js');
          const companyLabel = smsSettings.companyName || 'us';
          const companyPhone = smsSettings.twilioPhoneNumber || smsSettings.companyPhone || '';
          const phoneDisplay = companyPhone ? ` at ${companyPhone}` : '';

          const contactName = session.contactName || '';
          const isKnownContact = !!contactId && contactName && contactName !== 'Unknown' && contactName !== 'Unknown Caller';
          const firstName = contactName.split(/\s+/)[0] || '';

          const bookingLink = getBookingLink(smsSettings);

          let smsBody: string;
          if (smsSettings.aiFollowUpSmsMessage) {
            smsBody = replaceTags(smsSettings.aiFollowUpSmsMessage, { name: contactName || 'there' }, smsSettings as any);
          } else if (isKnownContact && firstName) {
            smsBody = `Hey ${firstName}, sorry we missed your call! We'll get back to you as soon as possible. Feel free to call us back${phoneDisplay} or reply to this text.${bookingLink ? `\n\nNeed a quote? You can also fill out our form here: ${bookingLink}` : ''}`;
          } else {
            smsBody = `Thanks for calling ${companyLabel}! We got your message and will get back to you shortly. Feel free to call us back${phoneDisplay} or reply to this text if you need anything.${bookingLink ? `\n\nLooking for a quote? Fill out our form here: ${bookingLink}` : ''}`;
          }
          const smsResult = await sendSms(smsSettings, { to: session.customerPhone, body: smsBody });
          if (smsResult.success) {
            console.log(`[AI Assistant] Follow-up SMS sent to ${session.customerPhone} for call ${callSid}`);
            try {
              await storage.createCommunication(session.userId, {
                contactId: contactId || null,
                phoneNumber: session.customerPhone,
                type: 'sms',
                direction: 'outbound',
                content: smsBody,
              });
            } catch (commErr2) {
              console.error('[AI Assistant] Error logging follow-up SMS communication:', commErr2);
            }
          } else {
            console.error(`[AI Assistant] Follow-up SMS failed for ${session.customerPhone}:`, smsResult.error);
          }
        } else {
          console.log(`[AI Assistant] Follow-up SMS disabled for user ${session.userId}, skipping`);
        }
      } catch (smsErr: any) {
        console.error('[AI Assistant] Error sending follow-up SMS:', smsErr.message);
      }
    }

    console.log(`[AI Assistant] Call finalized: ${callSid}, duration=${durationSeconds}s, lead=${leadCaptured}`);
  } catch (err) {
    console.error('[AI Assistant] Error finalizing call:', err);
  }
}

export function createAiCallSession(params: {
  userId: string;
  callSid: string;
  customerPhone: string;
  contactName: string;
  contactId: number | null;
  companyName: string;
  isAfterHours?: boolean;
  missedOffice?: boolean;
  assistantName?: string | null;
  assistantVoice?: string;
  assistantMode?: string;
  callerContext?: CallerContext | null;
  disclosureEnabled?: boolean;
  disclosureMessage?: string;
  autoTransfer?: boolean;
  communicationId?: number | null;
}): AiCallSession {
  const session: AiCallSession = {
    ...params,
    isAfterHours: params.isAfterHours || false,
    missedOffice: params.missedOffice || false,
    assistantName: params.assistantName || null,
    assistantVoice: validateRealtimeVoice(params.assistantVoice),
    assistantMode: params.assistantMode || 'receptionist',
    callerContext: params.callerContext || null,
    disclosureEnabled: params.disclosureEnabled !== false,
    disclosureMessage: params.disclosureMessage || 'This call may be monitored or recorded for quality and training purposes.',
    autoTransfer: params.autoTransfer || false,
    transferInProgress: false,
    communicationId: params.communicationId || null,
    identityVerified: false,
    streamSid: null,
    openaiWs: null,
    twilioWs: null,
    startedAt: Date.now(),
    conversationLog: [],
    capturedLead: {},
  };
  aiCallSessions.set(params.callSid, session);
  return session;
}

export async function isAiAssistantEnabled(userId: string): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user?.aiAssistantStatus === 'active';
}

const AI_ASSISTANT_MINUTE_CAP = 500;

export async function isAiAssistantWithinUsageCap(userId: string): Promise<boolean> {
  const now = new Date();
  const [usage] = await db.select().from(aiAssistantUsage).where(
    and(
      eq(aiAssistantUsage.userId, userId),
      sql`${aiAssistantUsage.periodStart} <= ${now}`,
      sql`${aiAssistantUsage.periodEnd} > ${now}`
    )
  );
  if (!usage) return true;
  return usage.minutesUsed < AI_ASSISTANT_MINUTE_CAP;
}

export function generateAiHandoffTwiml(baseUrl: string, callSid: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${baseUrl.replace(/^https?:\/\//, '')}/api/twilio/ai-stream/${callSid}" />
  </Connect>
</Response>`;
}
