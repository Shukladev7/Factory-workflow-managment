
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
  try {
    // Validate input data
    if (!input.batches || input.batches.length === 0) {
      throw new Error("No batch data provided");
    }
    if (!input.rawMaterials || input.rawMaterials.length === 0) {
      throw new Error("No raw material data provided");
    }

    // Convert custom types to a JSON-serializable format for the prompt
    const serializableInput = {
        batches: JSON.stringify(input.batches.map(b => {
          const processingStages = b.processingStages || {};
          const createdDate = new Date(b.createdAt);
          const currentDate = new Date();
          const cycleDays = (currentDate.getTime() - createdDate.getTime()) / (1000 * 3600 * 24);
          
          return {
            id: b.id,
            productName: b.productName || 'Unknown Product',
            status: b.status || 'Unknown',
            createdAt: b.createdAt,
            totalQuantity: b.quantity || 0,
            processingStages: {
              Molding: {
                accepted: processingStages.Molding?.accepted || 0,
                rejected: processingStages.Molding?.rejected || 0,
                completed: processingStages.Molding?.completed || false
              },
              Machining: {
                accepted: processingStages.Machining?.accepted || 0,
                rejected: processingStages.Machining?.rejected || 0,
                completed: processingStages.Machining?.completed || false
              },
              Assembling: {
                accepted: processingStages.Assembling?.accepted || 0,
                rejected: processingStages.Assembling?.rejected || 0,
                completed: processingStages.Assembling?.completed || false
              },
              Testing: {
                accepted: processingStages.Testing?.accepted || 0,
                rejected: processingStages.Testing?.rejected || 0,
                completed: processingStages.Testing?.completed || false
              }
            },
            wastage: {
                Molding: processingStages.Molding?.rejected || 0,
                Machining: processingStages.Machining?.rejected || 0,
                Assembling: processingStages.Assembling?.rejected || 0,
                Testing: processingStages.Testing?.rejected || 0
            },
            totalWastage: (processingStages.Molding?.rejected || 0) + 
                         (processingStages.Machining?.rejected || 0) + 
                         (processingStages.Assembling?.rejected || 0) + 
                         (processingStages.Testing?.rejected || 0),
            cycleTime: b.status === 'Completed' ? `${cycleDays.toFixed(1)} days` : 'In Progress',
            efficiency: calculateBatchEfficiency(processingStages)
          };
        })),
        rawMaterials: JSON.stringify(input.rawMaterials.map(m => ({
            id: m.id,
            name: m.name || 'Unknown Material',
            sku: m.sku || 'N/A',
            quantity: Math.max(0, m.quantity || 0),
            threshold: Math.max(0, m.threshold || 0),
            unit: m.unit || 'units',
            isLowStock: (m.quantity || 0) < (m.threshold || 0),
            stockLevel: getStockLevel(m.quantity || 0, m.threshold || 0),
            daysUntilStockout: estimateDaysUntilStockout(m.quantity || 0, m.threshold || 0)
        })))
    };
    
    console.log('Sending data to AI model:', { 
      batchCount: input.batches.length, 
      materialCount: input.rawMaterials.length 
    });
    
    const output = await productionAnalysisFlow(serializableInput);
    
    if (!output || !output.suggestions || output.suggestions.length === 0) {
        console.warn("AI model returned empty suggestions, using fallback");
        return generateFallbackSuggestions(input);
    }
    
    // Validate and sanitize AI output
    const validatedSuggestions = output.suggestions
      .filter(suggestion => suggestion.suggestion && suggestion.reasoning)
      .map(suggestion => ({
        ...suggestion,
        chart: {
          title: suggestion.chart?.title || 'Data Analysis',
          data: (suggestion.chart?.data || []).filter(point => 
            point.name && typeof point.value === 'number'
          )
        }
      }));
    
    return { suggestions: validatedSuggestions };
    
  } catch (error) {
    console.error('AI suggestion generation failed:', error);
    return generateFallbackSuggestions(input);
  }
}

// Helper functions
function calculateBatchEfficiency(processingStages: any): number {
  const totalAccepted = Object.values(processingStages)
    .reduce((sum: number, stage: any) => sum + (stage?.accepted || 0), 0);
  const totalRejected = Object.values(processingStages)
    .reduce((sum: number, stage: any) => sum + (stage?.rejected || 0), 0);
  const total = totalAccepted + totalRejected;
  return total > 0 ? Math.round((totalAccepted / total) * 100 * 10) / 10 : 0;
}

function getStockLevel(quantity: number, threshold: number): string {
  if (quantity <= 0) return 'Out of Stock';
  if (quantity < threshold) return 'Low Stock';
  if (quantity < threshold * 2) return 'Adequate';
  return 'Well Stocked';
}

function estimateDaysUntilStockout(quantity: number, threshold: number): number {
  // Simple estimation - in reality this would use consumption rate
  if (quantity <= threshold) return 0;
  return Math.ceil((quantity - threshold) / Math.max(1, threshold * 0.1));
}

function generateFallbackSuggestions(input: ProductionAnalysisInput): ProductionAnalysisOutput {
  const suggestions: ProductionSuggestion[] = [];
  
  // Low stock materials suggestion
  const lowStockMaterials = input.rawMaterials.filter(m => (m.quantity || 0) < (m.threshold || 0));
  if (lowStockMaterials.length > 0) {
    suggestions.push({
      suggestion: "Restock Critical Materials",
      reasoning: `${lowStockMaterials.length} materials are below threshold levels. Immediate restocking required to prevent production delays.`,
      chart: {
        title: "Low Stock Materials",
        data: lowStockMaterials.slice(0, 5).map(m => ({
          name: m.name || 'Unknown',
          value: m.quantity || 0,
          threshold: m.threshold || 0
        }))
      }
    });
  }
  
  // Wastage analysis
  const completedBatches = input.batches.filter(b => b.status === 'Completed');
  if (completedBatches.length > 0) {
    const wastageByProduct = completedBatches.reduce((acc: any, batch) => {
      const productName = batch.productName || 'Unknown';
      const totalWastage = Object.values(batch.processingStages || {})
        .reduce((sum: number, stage: any) => sum + (stage?.rejected || 0), 0);
      
      if (!acc[productName]) acc[productName] = 0;
      acc[productName] += totalWastage;
      return acc;
    }, {});
    
    const topWastageProducts = Object.entries(wastageByProduct)
      .sort(([,a]: any, [,b]: any) => b - a)
      .slice(0, 5);
    
    if (topWastageProducts.length > 0 && topWastageProducts[0][1] > 0) {
      suggestions.push({
        suggestion: "Optimize Quality Control Processes",
        reasoning: `Quality issues detected. Top wastage product: ${topWastageProducts[0][0]} with ${topWastageProducts[0][1]} rejected units.`,
        chart: {
          title: "Wastage by Product",
          data: topWastageProducts.map(([name, value]: any) => ({
            name: String(name),
            value: Number(value)
          }))
        }
      });
    }
  }
  
  // Production capacity suggestion
  if (completedBatches.length > 0) {
    const avgProductionRate = completedBatches.length / 4; // Assume 4 weeks of data
    if (avgProductionRate < 5) {
      suggestions.push({
        suggestion: "Increase Production Throughput",
        reasoning: `Current production rate is ${avgProductionRate.toFixed(1)} batches/week. Consider optimizing scheduling and resource allocation.`,
        chart: {
          title: "Production Rate Analysis",
          data: [
            { name: "Current Rate", value: Math.round(avgProductionRate * 10) / 10 },
            { name: "Target Rate", value: 5 },
            { name: "Gap", value: Math.max(0, 5 - avgProductionRate) }
          ]
        }
      });
    }
  }
  
  return { suggestions: suggestions.slice(0, 3) }; // Max 3 suggestions
}

const productionAnalysisPrompt = ai.definePrompt({
    name: 'productionAnalysisPrompt',
    model: googleAI.model('gemini-2.5-flash'),
    input: { schema: z.object({ batches: z.string(), rawMaterials: z.string() }) },
    output: { schema: ProductionAnalysisOutputSchema },
    prompt: `
        You are an expert production optimization consultant for a manufacturing facility. Analyze the provided production data and generate 2-4 actionable, data-driven suggestions to improve operational efficiency.

        ANALYSIS FOCUS AREAS:
        1. **Inventory Management**: Identify materials below threshold levels that require immediate restocking
        2. **Quality Control**: Find products/stages with high rejection rates that need process optimization
        3. **Production Efficiency**: Detect cycle time bottlenecks and capacity utilization issues
        4. **Resource Optimization**: Suggest improvements for better resource allocation and scheduling

        OUTPUT REQUIREMENTS:
        - Each suggestion must be specific, actionable, and backed by data evidence
        - Chart data must contain exactly 3-5 data points with numerical values
        - For inventory suggestions: include both current quantity and threshold in chart data
        - For quality suggestions: show top wastage sources with rejection counts
        - For efficiency suggestions: compare current vs target performance metrics

        DATA PROVIDED:
        
        Production Batches (with processing stages, wastage, and cycle times):
        \`\`\`json
        {{{batches}}}
        \`\`\`

        Raw Material Inventory (with stock levels and thresholds):
        \`\`\`json
        {{{rawMaterials}}}
        \`\`\`

        EXAMPLE OUTPUT FORMAT:
        {
          "suggestions": [
            {
              "suggestion": "Restock critical materials to prevent production delays",
              "reasoning": "3 materials are below safety stock: Steel Rods (50 vs 100 threshold), Plastic Pellets (25 vs 80 threshold), showing immediate restocking need",
              "chart": {
                "title": "Critical Low Stock Materials",
                "data": [
                  { "name": "Steel Rods", "value": 50, "threshold": 100 },
                  { "name": "Plastic Pellets", "value": 25, "threshold": 80 }
                ]
              }
            }
          ]
        }

        Generate suggestions now based on the actual data provided above.
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
