const PROVIDERS = {
  openai: { label: "ChatGPT", keyName: "OPENAI_API_KEY", modelName: "OPENAI_MODEL", defaultModel: "gpt-4o-mini" },
  anthropic: { label: "Claude", keyName: "ANTHROPIC_API_KEY", modelName: "ANTHROPIC_MODEL", defaultModel: "claude-3-5-haiku-latest" },
  gemini: { label: "Gemini", keyName: "GEMINI_API_KEY", modelName: "GEMINI_MODEL", defaultModel: "gemini-2.5-flash" }
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/api/recipe" || request.method !== "POST") {
      return json({ error: "Not found" }, 404);
    }

    try {
      const payload = await request.json();
      const provider = normalizeProvider(payload?.request?.provider || "openai");
      const result = provider === "all"
        ? await requestAllProviders(payload, env)
        : await requestSingleProvider(provider, payload, env);

      return json(result);
    } catch (error) {
      return json({ error: error.message || "Recipe generation failed" }, 500);
    }
  }
};

function normalizeProvider(provider) {
  if (["openai", "anthropic", "gemini", "all"].includes(provider)) return provider;
  return "openai";
}

async function requestAllProviders(payload, env) {
  const targets = ["openai", "anthropic", "gemini"].filter((provider) => env[PROVIDERS[provider].keyName]);
  if (!targets.length) {
    throw new Error("등록된 AI API 키가 없습니다. OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY 중 하나 이상을 Worker 환경변수에 등록해주세요.");
  }

  const requests = targets.map((provider) => requestSingleProvider(provider, payload, env, 2));
  const settled = await Promise.allSettled(requests);
  const recipes = [];
  const errors = [];

  settled.forEach((item, index) => {
    const provider = targets[index];
    if (item.status === "fulfilled") {
      recipes.push(...item.value.recipes);
    } else {
      errors.push({ provider, label: PROVIDERS[provider].label, message: item.reason?.message || "요청 실패" });
    }
  });

  if (!recipes.length) {
    throw new Error(errors.map((item) => `${item.label}: ${item.message}`).join(" / ") || "모든 AI 요청이 실패했습니다.");
  }

  return { provider: "all", recipes: recipes.slice(0, 9), errors };
}

async function requestSingleProvider(provider, payload, env, countOverride) {
  if (provider === "openai") return requestOpenAI(payload, env, countOverride);
  if (provider === "anthropic") return requestAnthropic(payload, env, countOverride);
  if (provider === "gemini") return requestGemini(payload, env, countOverride);
  throw new Error(`지원하지 않는 AI 제공자입니다: ${provider}`);
}

async function requestOpenAI(payload, env, countOverride) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 환경변수가 없습니다.");

  const model = env.OPENAI_MODEL || PROVIDERS.openai.defaultModel;
  const prompt = buildPrompt(payload, countOverride);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    })
  });

  const data = await readJsonOrThrow(response, "ChatGPT");
  const text = data.choices?.[0]?.message?.content || "";
  return packRecipes("openai", model, text, countOverride || payload?.request?.recipeCount || 3);
}

async function requestAnthropic(payload, env, countOverride) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 없습니다.");

  const model = env.ANTHROPIC_MODEL || PROVIDERS.anthropic.defaultModel;
  const prompt = buildPrompt(payload, countOverride);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 2500,
      temperature: 0.7,
      system: systemPrompt(),
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await readJsonOrThrow(response, "Claude");
  const text = (data.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  return packRecipes("anthropic", model, text, countOverride || payload?.request?.recipeCount || 3);
}

async function requestGemini(payload, env, countOverride) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 환경변수가 없습니다.");

  const model = env.GEMINI_MODEL || PROVIDERS.gemini.defaultModel;
  const prompt = `${systemPrompt()}\n\n${buildPrompt(payload, countOverride)}`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    })
  });

  const data = await readJsonOrThrow(response, "Gemini");
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
  return packRecipes("gemini", model, text, countOverride || payload?.request?.recipeCount || 3);
}

function systemPrompt() {
  return "너는 냉장고 재료 기반으로 실용적인 한국어 집밥 레시피를 제안하는 요리 도우미야. 반드시 JSON만 응답해.";
}

function buildPrompt(payload, countOverride) {
  const recipeCount = countOverride || payload?.request?.recipeCount || 3;
  return `
현재 냉장고 재료를 기준으로 레시피 ${recipeCount}개를 추천해줘.

조건:
- mustUse가 true인 재료는 유통기한과 관계없이 반드시 포함
- mustUse가 true인 재료가 없을 때만 유통기한이 가까운 재료를 우선 고려
- 한국어로 작성
- 너무 거창한 요리보다 실제 집에서 가능한 메뉴
- 부족한 재료는 missingOptionalIngredients에만 넣고, 필수 재료처럼 강요하지 말 것
- 아래 JSON 스키마로만 응답

요청 옵션:
${JSON.stringify(payload.request, null, 2)}

재료 목록:
${JSON.stringify(payload.ingredients, null, 2)}

응답 형식:
{
  "recipes": [
    {
      "title": "레시피명",
      "summary": "요약",
      "usedIngredients": ["재료명"],
      "missingOptionalIngredients": ["있으면 좋은 재료"],
      "cookingTime": "20분",
      "difficulty": "쉬움",
      "steps": ["1단계", "2단계", "3단계"]
    }
  ]
}
`;
}

async function readJsonOrThrow(response, label) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} API 오류: ${response.status} ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} API 응답을 JSON으로 읽지 못했습니다.`);
  }
}

function packRecipes(provider, model, text, limit) {
  const parsed = parseRecipeJson(text);
  const recipes = Array.isArray(parsed.recipes) ? parsed.recipes : [];
  if (!recipes.length) {
    throw new Error(`${PROVIDERS[provider].label} 응답에 recipes 배열이 없습니다.`);
  }
  return {
    provider,
    model,
    recipes: recipes.slice(0, limit).map((recipe) => ({
      ...recipe,
      provider,
      providerLabel: PROVIDERS[provider].label,
      model
    }))
  };
}

function parseRecipeJson(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw error;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
