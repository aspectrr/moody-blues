import { sendMessage } from "./index.js";
import { AnalysisResult } from "../types/issues";
import { formatError } from "../utils/error";

// Define prompt templates
const ANALYSIS_SYSTEM_PROMPT = `
You are an expert software engineer specialized in analyzing and debugging issues in open source projects.
Your task is to analyze the given problem description and extract key information to help with troubleshooting.

Your analysis should include:
1. Problem category
2. Project component(s) involved
3. Estimated complexity
4. Required tools for debugging
5. Potential solutions
6. Reproducibility steps (if applicable)

Respond in valid JSON format only, with the following structure:
{
  "problemCategory": "bug" | "feature_request" | "implementation_question" | "installation" | "other",
  "projectComponent": string,
  "estimatedComplexity": "low" | "medium" | "high",
  "requiredTools": string[],
  "potentialSolutions": string[],
  "reproducibilitySteps": string[] (optional),
  "additionalContext": Record<string, any> (optional)
}
`;

/**
 * Analyzes a user query to extract structured information about the issue
 * @param query The user's initial query text
 * @returns Structured analysis of the issue
 */
export async function analyzeUserQuery(query: string): Promise<AnalysisResult> {
  try {
    console.log("Analyzing user query with LLM...");

    // Construct the prompt
    const userPrompt = `
Please analyze the following request for help with a technical issue:

"""
${query}
"""

Provide a structured analysis to help understand what troubleshooting will be required.
`;

    // Send to LLM for analysis
    const response = await sendMessage(
      userPrompt,
      ANALYSIS_SYSTEM_PROMPT,
      //   {
      //   temperature: 0.2, // Lower temperature for more consistent results
      // }
    );

    // Parse the response as JSON
    let analysisResult: AnalysisResult;
    try {
      analysisResult = JSON.parse(response);
    } catch (parseError) {
      console.error(
        "Failed to parse LLM response as JSON:",
        formatError(parseError),
      );
      console.error("Raw response:", response);

      // Attempt to extract JSON from response if it contains other text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          analysisResult = JSON.parse(jsonMatch[0]);
        } catch (secondParseError) {
          throw new Error("Failed to extract valid JSON from LLM response");
        }
      } else {
        throw new Error("No valid JSON found in LLM response");
      }
    }

    // Validate the parsed result
    validateAnalysisResult(analysisResult);

    console.log("Successfully analyzed user query");
    return analysisResult;
  } catch (error) {
    console.error("Error analyzing user query:", formatError(error));

    // Provide a default analysis when LLM analysis fails
    return {
      problemCategory: "other",
      projectComponent: "unknown",
      estimatedComplexity: "medium",
      requiredTools: ["manual-investigation"],
      potentialSolutions: ["Need more information to diagnose the issue"],
    };
  }
}

/**
 * Ask targeted follow-up questions based on initial analysis
 * @param query The original query
 * @param analysis The initial analysis
 * @returns Additional questions to ask
 */
export async function generateFollowUpQuestions(
  query: string,
  analysis: AnalysisResult,
): Promise<string[]> {
  try {
    const prompt = `
Based on the user's question and our initial analysis, generate 2-3 specific follow-up questions
that will help us better understand and reproduce the issue. The questions should be clear, concise,
and directly related to identifying the root cause or getting more context.

Original question:
"""
${query}
"""

Initial analysis:
"""
${JSON.stringify(analysis, null, 2)}
"""

Return ONLY an array of follow-up questions in valid JSON format, like this:
["question 1", "question 2", "question 3"]
`;

    const systemPrompt = `
You are a technical support engineer who needs to gather more information to solve a problem.
Focus on questions that will help with reproducing the issue or clarifying ambiguous details.
Respond ONLY with a JSON array of strings containing follow-up questions.
`;

    const response = await sendMessage(
      prompt,
      systemPrompt,
      //   {
      //   temperature: 0.7, // Higher temperature for more creative questions
      // }
    );

    let questions: string[];
    try {
      questions = JSON.parse(response);

      // Ensure we have an array of strings
      if (
        !Array.isArray(questions) ||
        !questions.every((q) => typeof q === "string")
      ) {
        throw new Error("Response is not an array of strings");
      }
    } catch (parseError) {
      console.error(
        "Failed to parse follow-up questions as JSON:",
        formatError(parseError),
      );

      // Attempt to extract JSON array from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          questions = JSON.parse(jsonMatch[0]);
        } catch (secondParseError) {
          return [
            "Could you provide more details about your setup?",
            "What steps have you already tried?",
            "Can you share any error messages you're seeing?",
          ];
        }
      } else {
        return [
          "Could you provide more details about your setup?",
          "What steps have you already tried?",
          "Can you share any error messages you're seeing?",
        ];
      }
    }

    return questions;
  } catch (error) {
    console.error("Error generating follow-up questions:", formatError(error));
    return [
      "Could you provide more details about your setup?",
      "What steps have you already tried?",
      "Can you share any error messages you're seeing?",
    ];
  }
}

/**
 * Validate the structure of the analysis result
 * @param analysis The analysis result to validate
 * @throws Error if validation fails
 */
function validateAnalysisResult(
  analysis: any,
): asserts analysis is AnalysisResult {
  // Check required fields
  const requiredFields = [
    "problemCategory",
    "projectComponent",
    "estimatedComplexity",
    "requiredTools",
    "potentialSolutions",
  ];
  for (const field of requiredFields) {
    if (!analysis[field]) {
      throw new Error(`Missing required field in analysis: ${field}`);
    }
  }

  // Check problemCategory value
  const validCategories = [
    "bug",
    "feature_request",
    "implementation_question",
    "installation",
    "other",
  ];
  if (!validCategories.includes(analysis.problemCategory)) {
    throw new Error(`Invalid problem category: ${analysis.problemCategory}`);
  }

  // Check complexity value
  const validComplexity = ["low", "medium", "high"];
  if (!validComplexity.includes(analysis.estimatedComplexity)) {
    throw new Error(
      `Invalid complexity level: ${analysis.estimatedComplexity}`,
    );
  }

  // Check arrays
  if (
    !Array.isArray(analysis.requiredTools) ||
    analysis.requiredTools.length === 0
  ) {
    throw new Error("Required tools must be a non-empty array");
  }

  if (
    !Array.isArray(analysis.potentialSolutions) ||
    analysis.potentialSolutions.length === 0
  ) {
    throw new Error("Potential solutions must be a non-empty array");
  }

  // Optional fields
  if (
    analysis.reproducibilitySteps &&
    !Array.isArray(analysis.reproducibilitySteps)
  ) {
    throw new Error("Reproducibility steps must be an array if provided");
  }

  if (
    analysis.additionalContext &&
    typeof analysis.additionalContext !== "object"
  ) {
    throw new Error("Additional context must be an object if provided");
  }
}
