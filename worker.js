const PROVIDERS = {
  openai: {
    label: "ChatGPT",
    defaultModel: "gpt-4o-mini",
    keyNames: ["OPENAI_API_KEY", "CHATGPT_API_KEY", "OPEN_API_KEY", "OPENAI_KEY"]
  },
  anthropic: {
    label: "Claude",
    defaultModel: "claude-3-5-haiku-latest",
    keyNames: ["CLAUDE_API_KEY", "ANTHROPIC_API_KEY", "CLAUDE_KEY"]
  },
  gemini: {
    label: "Gemini",
    defaultModel: "gemini-2.5-flash",
    keyNames: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_AI_API_KEY"]
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);
    let payload = null;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === "/" || url.pathname === "/api/health") {
        return json(buildHealth(env), 200, cors);
      }

      if (url.pathname !== "/api/recipe") {
        return json({ ok: false, error: "Not found" }, 404, cors);
      }

      if (request.method !== "POST") {
        return json({ ok: false, error: "POST only" }, 405, cors);
      }

      payload = await request.json();
      const requestedProvider = normalizeProvider(payload?.request?.provider || payload?.provider || "openai");

      if (requestedProvider === "local") {
        return json({ ok: true, provider: "local", recipes: makeLocalRecipes(payload), warnings: [] }, 200, cors);
      }

      const result = requestedProvider === "all"
        ? await requestAllProviders(payload, env)
        : await requestProviderWithFallback(requestedProvider, payload, env);

      return json({ ok: true, ...result }, 200, cors);
    } catch (error) {
      const fallbackRecipes = makeLocalRecipes(payload || {});
      return json({
        ok: true,
        provider: "local",
        fallbackFrom: "worker-error",
        recipes: fallbackRecipes,
        warnings: [serializeWarning("worker", "Worker", error)],
        friendlyError: makeFriendlyError(error),
        health: buildHealth(env)
      }, 200, cors);
    }
  }
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

function buildHealth(env) {
  return {
    ok: true,
    service: "chef-ai-worker",
    message: "냉장고를 부탁해 AI Worker 정상 작동 중",
    keys: {
      openai: Boolean(getProviderKey("openai", env)),
      claude: Boolean(getProviderKey("anthropic", env)),
      gemini: Boolean(getProviderKey("gemini", env))
    },
    detectedKeyNames: {
      openai: getDetectedKeyNames("openai", env),
      claude: getDetectedKeyNames("anthropic", env),
      gemini: getDetectedKeyNames("gemini", env)
    },
    models: {
      openai: env.OPENAI_MODEL || PROVIDERS.openai.defaultModel,
      claude: env.CLAUDE_MODEL || env.ANTHROPIC_MODEL || PROVIDERS.anthropic.defaultModel,
      gemini: env.GEMINI_MODEL || PROVIDERS.gemini.defaultModel
    }
  };
}

function getProviderKey(provider, env) {
  const config = PROVIDERS[provider];
  if (!config) return "";
  for (const name of config.keyNames) {
    const value = env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getDetectedKeyNames(provider, env) {
  const config = PROVIDERS[provider];
  if (!config) return [];
  return config.keyNames.filter((name) => typeof env[name] === "string" && env[name].trim());
}

function normalizeProvider(provider) {
  const value = String(provider || "").toLowerCase().trim();
  if (["openai", "chatgpt", "gpt", "챗지피티"].includes(value)) return "openai";
  if (["anthropic", "claude", "클로드", "클러드"].includes(value)) return "anthropic";
  if (["gemini", "google", "제미나이"].includes(value)) return "gemini";
  if (["all", "compare", "전체", "비교"].includes(value)) return "all";
  if (["local", "offline", "로컬"].includes(value)) return "local";
  return "openai";
}

function hasKey(provider, env) {
  return Boolean(getProviderKey(provider, env));
}

async function requestAllProviders(payload, env) {
  const targets = ["openai", "anthropic", "gemini"].filter((provider) => hasKey(provider, env));

  if (!targets.length) {
    return {
      provider: "local",
      fallbackFrom: "all",
      recipes: makeLocalRecipes(payload),
      warnings: [{ provider: "all", label: "AI", message: "등록된 AI API 키가 없어 로컬 추천으로 대신 표시했습니다." }]
    };
  }

  const settled = await Promise.allSettled(targets.map((provider) => requestSingleProvider(provider, payload, env, 2)));
  const recipes = [];
  const warnings = [];

  settled.forEach((item, index) => {
    const provider = targets[index];
    if (item.status === "fulfilled") {
      recipes.push(...item.value.recipes);
    } else {
      warnings.push(serializeWarning(provider, PROVIDERS[provider].label, item.reason));
    }
  });

  if (!recipes.length) {
    return {
      provider: "local",
      fallbackFrom: "all",
      recipes: makeLocalRecipes(payload),
      warnings: warnings.length ? warnings : [{ provider: "all", label: "AI", message: "모든 AI 요청이 실패해 로컬 추천으로 대신 표시했습니다." }]
    };
  }

  return {
    provider: "all",
    recipes: recipes.slice(0, 9),
    warnings
  };
}

async function requestProviderWithFallback(provider, payload, env) {
  const warnings = [];
  const fallbackOrder = [provider, "openai", "anthropic", "gemini"]
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .filter((item) => item !== "gemini" || provider === "gemini" || provider === "all");

  for (const candidate of fallbackOrder) {
    if (!hasKey(candidate, env)) {
      warnings.push({
        provider: candidate,
        label: PROVIDERS[candidate]?.label || candidate,
        message: `${PROVIDERS[candidate]?.label || candidate} API 키가 Worker 환경변수에 없습니다.`
      });
      continue;
    }

    try {
      const result = await requestSingleProvider(candidate, payload, env);
      if (candidate !== provider) {
        return {
          ...result,
          provider: candidate,
          fallbackFrom: provider,
          warnings
        };
      }
      return { ...result, warnings };
    } catch (error) {
      warnings.push(serializeWarning(candidate, PROVIDERS[candidate].label, error));
    }
  }

  return {
    provider: "local",
    fallbackFrom: provider,
    recipes: makeLocalRecipes(payload),
    warnings
  };
}

async function requestSingleProvider(provider, payload, env, countOverride) {
  if (provider === "openai") return requestOpenAI(payload, env, countOverride);
  if (provider === "anthropic") return requestClaude(payload, env, countOverride);
  if (provider === "gemini") return requestGemini(payload, env, countOverride);
  throw new Error(`지원하지 않는 AI 제공자입니다: ${provider}`);
}

async function requestOpenAI(payload, env, countOverride) {
  const apiKey = getProviderKey("openai", env);
  if (!apiKey) throw new Error("OPENAI_API_KEY가 없습니다.");

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

async function requestClaude(payload, env, countOverride) {
  const apiKey = getProviderKey("anthropic", env);
  if (!apiKey) throw new Error("CLAUDE_API_KEY가 없습니다.");

  const model = env.CLAUDE_MODEL || env.ANTHROPIC_MODEL || PROVIDERS.anthropic.defaultModel;
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
    .map((part) => part.text || "")
    .join("\n");

  return packRecipes("anthropic", model, text, countOverride || payload?.request?.recipeCount || 3);
}

async function requestGemini(payload, env, countOverride) {
  const apiKey = getProviderKey("gemini", env);
  if (!apiKey) throw new Error("GEMINI_API_KEY가 없습니다.");

  const model = env.GEMINI_MODEL || PROVIDERS.gemini.defaultModel;
  const prompt = `${systemPrompt()}\n\n${buildPrompt(payload, countOverride)}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
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
    }
  );

  const data = await readJsonOrThrow(response, "Gemini");
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
  return packRecipes("gemini", model, text, countOverride || payload?.request?.recipeCount || 3);
}

function systemPrompt() {
  return "너는 냉장고 재료 기반으로 실용적인 한국어 집밥 레시피를 제안하는 요리 도우미야. 반드시 JSON만 응답해.";
}

function buildPrompt(payload, countOverride) {
  const recipeCount = countOverride || payload?.request?.recipeCount || 3;
  const ingredients = Array.isArray(payload?.ingredients) ? payload.ingredients : [];
  const mustUse = ingredients.filter((item) => item.mustUse === true).map((item) => item.name).filter(Boolean);
  const targetMenu = String(payload?.request?.targetMenu || "").trim();
  const allowShopping = Boolean(payload?.request?.allowShopping) || payload?.request?.purchaseMode === "allow-shopping";
  const purchaseRule = allowShopping
    ? "부족한 재료가 있으면 missingOptionalIngredients에 '추가 구매 후보'로 제안해도 됨. 단, 냉장고 재료로 가능한 부분을 먼저 구성할 것"
    : "추가 구매 없이 냉장고에 있는 재료만 사용. 냉장고에 없는 재료는 필수 단계나 usedIngredients에 넣지 말고, missingOptionalIngredients도 가능하면 빈 배열로 둘 것";

  return `
현재 냉장고 재료를 기준으로 레시피 ${recipeCount}개를 추천해줘.

조건:
- mustUse가 true인 재료는 유통기한과 관계없이 반드시 포함
- 먹고 싶은 메뉴가 있으면 그 메뉴를 최대한 반영하되, 냉장고 재료 조건을 우선할 것
- 먹고 싶은 메뉴가 냉장고 재료와 맞지 않으면 "냉장고식/응용" 레시피로 제안할 것
- ${purchaseRule}
- mustUse가 true인 재료가 없을 때만 유통기한이 가까운 재료를 우선 고려
- 한국어로 작성
- 너무 거창한 요리보다 실제 집에서 가능한 메뉴
- 아래 JSON 스키마로만 응답

먹고 싶은 메뉴:
${targetMenu || "없음"}

추가 구매 정책:
${allowShopping ? "부족한 재료 추가 구매 가능" : "추가 구매 없이 냉장고 재료만 사용"}

이번 추천에 꼭 포함할 재료:
${mustUse.length ? mustUse.join(", ") : "없음"}

요청 옵션:
${JSON.stringify(payload.request || {}, null, 2)}

재료 목록:
${JSON.stringify(ingredients, null, 2)}

응답 형식:
{
  "recipes": [
    {
      "title": "레시피명",
      "summary": "요약",
      "usedIngredients": ["냉장고에서 실제로 쓰는 재료명"],
      "missingOptionalIngredients": ["추가 구매 가능 모드에서만 있으면 좋은 재료"],
      "cookingTime": "20분",
      "difficulty": "쉬움",
      "steps": ["1단계", "2단계", "3단계"]
    }
  ]
}
`.trim();
}

function serializeWarning(provider, label, error) {
  return {
    provider,
    label,
    message: makeFriendlyError(error)
  };
}

function makeFriendlyError(error) {
  const message = error?.message || String(error || "");
  if (/User location is not supported/i.test(message)) {
    return "Gemini API가 현재 Worker 실행 위치에서 제한되었습니다.";
  }
  if (/401|invalid api key|incorrect api key|unauthorized/i.test(message)) {
    return "API 키가 잘못되었거나 해당 프로젝트에서 사용할 수 없습니다.";
  }
  if (/403|permission|forbidden|billing|credit/i.test(message)) {
    return "API 키 권한, 결제/크레딧, 모델 접근 권한을 확인해야 합니다.";
  }
  if (/429|quota|rate limit/i.test(message)) {
    return "API 사용량 한도 또는 결제 한도에 걸렸습니다.";
  }
  return message || "AI 요청에 실패했습니다.";
}

async function readJsonOrThrow(response, label) {
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.error?.details || data?.message || data?.raw || text;
    throw new Error(`${label} API 오류: ${response.status} ${message}`);
  }

  return data;
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
      id: makeId(`${provider}_recipe`),
      title: recipe.title || "추천 레시피",
      summary: recipe.summary || "",
      usedIngredients: ensureArray(recipe.usedIngredients),
      missingOptionalIngredients: ensureArray(recipe.missingOptionalIngredients || recipe.missingIngredients || recipe.optionalIngredients),
      cookingTime: recipe.cookingTime || "",
      difficulty: recipe.difficulty || "쉬움",
      steps: ensureArray(recipe.steps),
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
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("AI 응답을 JSON으로 읽지 못했습니다.");
  }
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [String(value)];
}

function makeId(prefix = "id") {
  if (crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function makeLocalRecipes(payload) {
  const ingredients = Array.isArray(payload?.ingredients) ? payload.ingredients : [];
  const picked = ingredients.filter((item) => item.mustUse).slice(0, 3);
  const base = picked.length ? picked : ingredients.slice(0, 3);
  const names = base.map((item) => item.name).filter(Boolean);
  const targetMenu = String(payload?.request?.targetMenu || "").trim();
  const allowShopping = Boolean(payload?.request?.allowShopping) || payload?.request?.purchaseMode === "allow-shopping";

  const main = names[0] || "계란";
  const sub = names[1] || "양파";
  const sauce = names[2] || "간장";

  return [
    {
      id: makeId("local_recipe"),
      provider: "local",
      providerLabel: "로컬 추천",
      model: "local",
      title: targetMenu ? (allowShopping ? `${targetMenu} 맞춤 추천` : `냉장고식 ${targetMenu}`) : `${main} ${sub} 볶음`,
      summary: targetMenu
        ? `${targetMenu} 요청을 기준으로 선택한 재료를 최대한 반영한 메뉴예요. ${allowShopping ? "부족한 재료는 추가 구매 후보로 안내합니다." : "추가 구매 없이 냉장고 재료만 사용합니다."}`
        : "선택한 재료를 중심으로 빠르게 만들 수 있는 집밥 메뉴예요.",
      usedIngredients: names,
      missingOptionalIngredients: allowShopping ? ["대파", "후추"] : [],
      cookingTime: "15분",
      difficulty: "쉬움",
      steps: [
        `${main} 재료를 먹기 좋은 크기로 준비해요.`,
        `${sub}를 함께 넣고 중불에서 볶아요.`,
        `${sauce}로 간을 맞추고 한 번 더 볶아 마무리해요.`
      ]
    }
  ];
}
