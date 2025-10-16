
'use server';

/**
 * @fileoverview Provides AI-powered suggestions for production optimization based on recent data.
 * - getProductionSuggestions: A function that analyzes historical batch and material data to suggest improvements.
 * - ProductionAnalysisInput: The input type for the analysis, including batches and raw materials.
 * - ProductionAnalysisOutput: The return type, containing a list of suggestions with chart data.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { Batch, RawMaterial } from '@/lib/types';
import { googleAI } from '@genkit-ai/googleai';

const ChartDataPointSchema = z.object({
  name: z.string().describe('The label for the data point (e.g., a product name or a production stage).'),
  value: z.number().describe('The numerical value of the data point (e.g., current quantity or wastage count).'),
  threshold: z.number().optional().describe('The low-stock threshold, to be included only for low-stock suggestions.'),
});

const ProductionSuggestionSchema = z.object({
  suggestion: z.string().describe('A concise, actionable suggestion for improving the production process.'),
  reasoning: z.string().describe('A detailed explanation of why this suggestion is being made, citing specific data points from the historical data (e.g., high wastage rates for a product, long cycle times).'),
  chart: z.object({
    title: z.string().describe('A brief, descriptive title for the chart that visualizes the reasoning.'),
    data: z.array(ChartDataPointSchema).describe('An array of data points for the chart. Keep it simple, with 3-5 relevant data points to support the suggestion.'),
  }).describe('A simple dataset to generate a bar chart visualizing the core reason for the suggestion.'),
});
export type ProductionSuggestion = z.infer<typeof ProductionSuggestionSchema>;

const ProductionAnalysisInputSchema = z.object({
  batches: z.custom<Batch[]>().describe('An array of historical batch data from the last 90 days, including processing stages, timings, and materials used.'),
  rawMaterials: z.custom<RawMaterial[]>().describe('An array of current raw material inventory levels.'),
});
export type ProductionAnalysisInput = z.infer<typeof ProductionAnalysisInputSchema>;

const ProductionAnalysisOutputSchema = z.object({
  suggestions: z.array(ProductionSuggestionSchema).describe('A list of suggestions to optimize production.'),
});
export type ProductionAnalysisOutput = z.infer<typeof ProductionAnalysisOutputSchema>;


export async function getProductionSuggestions(input: ProductionAnalysisInput): Promise<ProductionAnalysisOutput> {
  // Convert custom types to a JSON-serializable format for the prompt
  const serializableInput = {
      batches: JSON.stringify(input.batches.map(b => ({
          productName: b.productName,
          status: b.status,
          createdAt: b.createdAt,
          wastage: {
              Molding: b.processingStages.Molding.rejected,
              Machining: b.processingStages.Machining.rejected,
              Assembling: b.processingStages.Assembling.rejected,
          },
          cycleTime: b.status === 'Completed' ? `${(new Date().getTime() - new Date(b.createdAt).getTime()) / (1000 * 3600 * 24)} days` : 'N/A'
      }))),
      rawMaterials: JSON.stringify(input.rawMaterials.map(m => ({
          name: m.name,
          quantity: m.quantity,
          threshold: m.threshold,
          isLowStock: m.quantity < m.threshold,
      })))
  };
  
  const output = await productionAnalysisFlow(serializableInput);
  if (!output) {
      throw new Error("The AI model did not return a valid output.");
  }
  return output;
}

const productionAnalysisPrompt = ai.definePrompt({
    name: 'productionAnalysisPrompt',
    model: googleAI.model('gemini-1.5-flash'),
    input: { schema: z.object({ batches: z.string(), rawMaterials: z.string() }) },
    output: { schema: ProductionAnalysisOutputSchema },
    prompt: `
        You are a production optimization expert for a manufacturing plant.
        Analyze the following historical production data from the last 90 days and provide actionable suggestions to improve efficiency, reduce waste, and manage inventory better.

        For each suggestion, provide:
        1. A concise 'suggestion' string.
        2. A 'reasoning' string explaining the "why" behind the suggestion, citing specific data.
        3. A 'chart' object containing a title and a small, focused dataset (3-5 data points) to visually represent the core data point in your reasoning.
        
        CRITICAL: 
        - When creating a chart for a low stock suggestion, the chart data MUST only include materials where 'isLowStock' is true. For each of these materials, you MUST include both the 'value' (current quantity) and the 'threshold' in the data point.
        - For wastage suggestions, the chart data should compare wastage numbers ('value') for a few top products. Do not include 'threshold' for wastage charts.

        Historical Batch Data (Last 90 Days):
        \`\`\`json
        {{{batches}}}
        \`\`\`

        Current Raw Material Stock:
        \`\`\`json
        {{{rawMaterials}}}
        \`\`\`

        Focus on areas like:
        - High wastage rates for specific products or stages.
        - Long production cycle times.
        - Frequent stockouts of raw materials.
        - Potential scheduling improvements.

        Provide a list of suggestions in the specified output format.
        `,
});

const productionAnalysisFlow = ai.defineFlow(
  {
    name: 'productionAnalysisFlow',
    inputSchema: z.object({
      batches: z.string(),
      rawMaterials: z.string(),
    }),
    outputSchema: ProductionAnalysisOutputSchema,
  },
  async (input) => {
    const { output } = await productionAnalysisPrompt(input);
    if (!output) {
      throw new Error("The AI model did not return a valid output.");
    }
    return output;
  }
);
