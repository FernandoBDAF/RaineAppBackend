import * as functions from "firebase-functions/v1";
import {defineSecret} from "firebase-functions/params";
import {HttpsError} from "firebase-functions/v1/https";
import * as logger from "firebase-functions/logger";
import OpenAI from "openai";
import type {ProfileSetupInput} from "../types";

const REGION = "us-west2";
const openaiApiKey = defineSecret("OPENAI_API_KEY");

interface GenerateBioRequest {
  profile: ProfileSetupInput;
  feedback?: string;
  regenerate?: boolean;
}

interface GenerateBioResponse {
  bio: string;
}

function formatLabel(id: string): string {
  return id.replace(/_/g, " ");
}

function buildUserPrompt(profile: ProfileSetupInput, feedback?: string): string {
  const parts: string[] = [];
  const firstName = profile.firstName || "a mom";
  const location =
    profile.city && profile.state ?
      `${profile.city}, ${profile.state}` :
      "the Bay Area";
  parts.push(`Write a bio for ${firstName}, a mom from ${location}.`);

  if (profile.childCount !== undefined && profile.childCount > 0) {
    const kidsLabel =
      profile.childCount === 1 ?
        "child" :
        "children";
    parts.push(`She has ${profile.childCount} ${kidsLabel}.`);
  }
  if (profile.isExpecting) {
    parts.push("She is expecting.");
  }
  if (
    profile.children &&
    Array.isArray(profile.children) &&
    profile.children.length > 0
  ) {
    const ages = profile.children
      .map((c) => {
        if (c.birthYear && c.birthMonth) {
          const now = new Date();
          const birth = new Date(c.birthYear, c.birthMonth - 1);
          const years = Math.floor(
            (now.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
          );
          return years >= 0 ? `${c.name} (${years})` : c.name;
        }
        return c.name;
      })
      .join(", ");
    parts.push(`Children: ${ages}.`);
  }

  const interests: string[] = [];
  if (profile.beforeMotherhood?.length) {
    interests.push(
      ...profile.beforeMotherhood.map((x) => formatLabel(x))
    );
  }
  if (profile.perfectWeekend?.length) {
    interests.push(
      ...profile.perfectWeekend.map((x) => formatLabel(x))
    );
  }
  if (profile.momFriendStyle?.length) {
    interests.push(
      ...profile.momFriendStyle.map((x) => formatLabel(x))
    );
  }
  if (interests.length > 0) {
    parts.push(`Her interests include: ${interests.join(", ")}.`);
  }
  if (profile.cityFeel) {
    parts.push(
      `She feels ${formatLabel(profile.cityFeel)} in her city.`
    );
  }
  if (profile.feelYourself) {
    parts.push(
      `She feels like herself when: ${formatLabel(profile.feelYourself)}.`
    );
  }
  if (profile.hardTruths?.length) {
    parts.push(
      `Hard truths she's learned: ${profile.hardTruths
        .map(formatLabel)
        .join(", ")}.`
    );
  }
  if (profile.unexpectedJoys?.length) {
    parts.push(
      `Unexpected joys: ${profile.unexpectedJoys
        .map(formatLabel)
        .join(", ")}.`
    );
  }
  if (profile.aesthetic?.length) {
    parts.push(
      `Aesthetic: ${profile.aesthetic.map(formatLabel).join(", ")}.`
    );
  }
  if (profile.whatBroughtYou) {
    parts.push(
      `Why she's here: ${formatLabel(profile.whatBroughtYou)}.`
    );
  }

  let userPrompt = parts.join(" ");
  if (feedback && feedback.trim()) {
    userPrompt += `\n\nUser feedback for regeneration: ${feedback.trim()}`;
  }
  return userPrompt;
}

export const generateProfileBio = functions
  .region(REGION)
  .runWith({secrets: [openaiApiKey]})
  .https.onCall(async (data, context): Promise<GenerateBioResponse> => {
    if (!context.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const userId = context.auth.uid;
    const {profile, feedback, regenerate} = data as GenerateBioRequest;

    if (!profile || typeof profile !== "object") {
      throw new HttpsError("invalid-argument", "Profile data is required");
    }

    const apiKey = openaiApiKey.value();
    if (!apiKey) {
      logger.error("OPENAI_API_KEY secret not configured");
      throw new HttpsError("internal", "Bio generation is not configured");
    }

    const systemPrompt =
      "You are a friendly copywriter helping mothers create short, authentic " +
      "bios for a social networking app. The bio should be 2-3 sentences, " +
      "warm in tone, and highlight what makes this mom unique. Do not use " +
      "emojis. Do not mention the app name. Keep it conversational and genuine.";
    const userPrompt = buildUserPrompt(profile, regenerate ? feedback : undefined);

    logger.info("Generating bio", {
      userId,
      regenerate: !!regenerate,
      hasFeedback: !!feedback,
    });

    try {
      const openai = new OpenAI({apiKey});
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {role: "system", content: systemPrompt},
          {role: "user", content: userPrompt},
        ],
        max_tokens: 150,
        temperature: 0.8,
      });

      const bio =
        completion.choices[0]?.message?.content?.trim() ?? "";

      if (!bio) {
        logger.error("OpenAI returned empty bio", {userId});
        throw new HttpsError("internal", "Failed to generate bio");
      }

      return {bio};
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error("Error generating bio", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new HttpsError("internal", "Failed to generate bio");
    }
  });
