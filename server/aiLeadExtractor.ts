import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export interface ExtractedLeadInfo {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  description?: string;
  isNewLead: boolean;
  hasUsefulInfo: boolean;
}

export async function extractLeadInfo(text: string, existingContactName?: string): Promise<ExtractedLeadInfo> {
  if (!openai) return { isNewLead: false, hasUsefulInfo: false };
  try {
    const prompt = existingContactName
      ? `You are analyzing a message or call transcript for a painting contractor's CRM. The contact "${existingContactName}" already exists but may be missing some info. Extract any NEW information from the text that could update their record.`
      : `You are analyzing a message or call transcript for a painting contractor's CRM. This came from an unknown number (no existing contact). Extract lead information from the conversation.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${prompt}

Return a JSON object with these fields (omit any field where the info is not available):
- "name": Full name of the person (first and last if available)
- "phone": Phone number if mentioned in text (NOT the caller's number, only if they mention a different callback number)
- "email": Email address if mentioned
- "address": Street address for the job/project
- "city": City name
- "state": State (2-letter abbreviation)
- "zip": ZIP code
- "description": Brief description of what they want done (e.g., "Interior painting for 3 bedrooms", "Exterior house painting", "Kitchen cabinet refinishing")
- "isNewLead": true if this appears to be a genuine inquiry about painting/home improvement services, false if it seems like spam, wrong number, robocall, or irrelevant
- "hasUsefulInfo": true if at least a name, address, or description was extracted, false if nothing useful was found

Be concise with the description. Focus on the service they need and scope of work.
Do NOT invent information. Only extract what is explicitly stated.`
        },
        {
          role: 'user',
          content: text.slice(0, 2000)
        }
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { isNewLead: false, hasUsefulInfo: false };

    const parsed = JSON.parse(content);
    return {
      name: parsed.name || undefined,
      phone: parsed.phone || undefined,
      email: parsed.email || undefined,
      address: parsed.address || undefined,
      city: parsed.city || undefined,
      state: parsed.state || undefined,
      zip: parsed.zip || undefined,
      description: parsed.description || undefined,
      isNewLead: parsed.isNewLead === true,
      hasUsefulInfo: parsed.hasUsefulInfo === true,
    };
  } catch (err: any) {
    console.error('[AILeadExtractor] Error:', err?.message);
    return { isNewLead: false, hasUsefulInfo: false };
  }
}

export async function extractInfoFromSms(body: string, existingContactName?: string): Promise<ExtractedLeadInfo> {
  if (!body || body.trim().length < 10) {
    return { isNewLead: false, hasUsefulInfo: false };
  }
  return extractLeadInfo(body, existingContactName);
}
