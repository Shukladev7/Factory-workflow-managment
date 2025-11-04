
'use server';

/**
 * @fileoverview Provides a conversational AI chatbot that can answer questions about the system's data.
 * - chatWithData: A function that takes a user's question and data context to provide a natural language answer.
 * - ChatInput: The input type for the chat function, including the question and data context.
 * - ChatOutput: The return type, containing the AI's answer.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { googleAI } from '@genkit-ai/googleai';
import { Batch, RawMaterial, FinalStock } from '@/lib/types';

const ChatInputSchema = z.object({
  question: z.string().describe('The question the user is asking.'),
  context: z.object({
    batches: z.custom<Batch[]>(),
    rawMaterials: z.custom<RawMaterial[]>(),
    finalStock: z.custom<FinalStock[]>(),
  }),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

const ChatOutputSchema = z.object({
  answer: z.string().describe("The AI's answer to the user's question."),
});
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

export async function chatWithData(input: ChatInput): Promise<ChatOutput> {
  const serializableContext = {
      question: input.question,
      context: JSON.stringify({
        batches: input.context.batches,
        rawMaterials: input.context.rawMaterials,
        finalStock: input.context.finalStock,
      }),
  };
  const result = await chatFlow(serializableContext);
  if (!result) {
      throw new Error("The AI model did not return a valid output.");
  }
  return result;
}

const chatPrompt = ai.definePrompt({
  name: 'chatPrompt',
  model: googleAI.model('gemini-2.5-flash'),
  input: { schema: z.object({ question: z.string(), context: z.string() }) },
  output: { schema: ChatOutputSchema },
  prompt: `
    You are an expert AI assistant for the StockPilot manufacturing application.
    Your role is to answer user questions based on the real-time data context provided below.
    Be helpful, friendly, and concise in your answers.

    DATA CONTEXT:
    \`\`\`json
    {{{context}}}
    \`\`\`

    USER QUESTION:
    "{{{question}}}"

    Based on the provided data, generate a clear and helpful answer. If the question cannot be answered with the given data, politely say so.
  `,
});

const chatFlow = ai.defineFlow(
  {
    name: 'chatFlow',
    inputSchema: z.object({ question: z.string(), context: z.string() }),
    outputSchema: ChatOutputSchema,
  },
  async (input) => {
    const { output } = await chatPrompt(input);
    if (!output) {
      throw new Error("The AI model did not return a valid output.");
    }
    return output;
  }
);
